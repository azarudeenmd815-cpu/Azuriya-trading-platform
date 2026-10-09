import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../domain/errors.js';
import { validateIdempotency } from '../api/idempotency.js';
import type { BrokerageRouteContext } from './common.js';
import { BrokerageFinanceService, financeListSchema, paymentStatusSchema, partnerStatusSchema } from './finance.js';

function identifier(request: FastifyRequest): string { return z.object({id:z.uuid()}).parse(request.params).id; }
function moneyMutation(request: FastifyRequest) {
  if(!validateIdempotency(request))throw new AppError(400,'IDEMPOTENCY_REQUIRED','Provide an Idempotency-Key for monetary workflow changes.');
}
function ownBody(request:FastifyRequest, forbidden:string[]=['client_id']) {
  if(request.body&&typeof request.body==='object'&&forbidden.some(field=>field in (request.body as object)))throw new AppError(400,'CLIENT_SCOPE_IMMUTABLE','The client scope is determined by your authenticated membership.');
  return request.body;
}

export function registerBrokerageFinanceRoutes(app:FastifyInstance,context:BrokerageRouteContext):void {
  const admin='/api/v1/instances/:instanceId/brokerage';
  const client='/api/v1/client/instances/:instanceId/brokerage';
  const clientListSchema=financeListSchema.omit({client_id:true});
  app.get(`${admin}/finance-settings`,async request=>({data:await new BrokerageFinanceService(context.db).settings(await context.staff(request,'brokerage.finance.read'))}));
  app.patch(`${admin}/finance-settings`,async(request,reply)=>{
    const scope=await context.staff(request,'brokerage.finance.approve',true);await context.highRisk(request,scope);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).updateSettings(scope,request.body)}));
  });
  app.get(`${admin}/payment-methods`,async request=>new BrokerageFinanceService(context.db).paymentMethods(await context.staff(request,'brokerage.finance.read')));
  app.get(`${client}/payment-methods`,async request=>new BrokerageFinanceService(context.db).paymentMethods(await context.client(request),true));
  app.post(`${admin}/payment-methods`,async(request,reply)=>{
    const scope=await context.staff(request,'brokerage.finance.write',true);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).savePaymentMethod(scope,request.body)}));
  });
  app.patch(`${admin}/payment-methods/:id`,async(request,reply)=>{
    const scope=await context.staff(request,'brokerage.finance.write',true);const id=identifier(request);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).savePaymentMethod(scope,request.body,id)}));
  });
  for(const [resource,kind] of [['deposits','deposit'],['withdrawals','withdrawal'],['transfers','transfer']] as const){
    app.get(`${admin}/${resource}`,async request=>new BrokerageFinanceService(context.db).listPayments(await context.staff(request,'brokerage.finance.read'),kind,financeListSchema.parse(request.query)));
    app.get(`${client}/${resource}`,async request=>new BrokerageFinanceService(context.db).listPayments(await context.client(request),kind,clientListSchema.parse(request.query),true));
    app.post(`${admin}/${resource}`,async(request,reply)=>{
      moneyMutation(request);const scope=await context.staff(request,'brokerage.finance.write',true);
      return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).createPayment(scope,kind,request.body)}));
    });
    app.post(`${client}/${resource}`,async(request,reply)=>{
      moneyMutation(request);const body=ownBody(request);const scope=await context.client(request,true);
      return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).createPayment(scope,kind,body,true)}));
    });
    app.post(`${admin}/${resource}/:id/status`,async(request,reply)=>{
      moneyMutation(request);const input=paymentStatusSchema.parse(request.body);const id=identifier(request);
      const permission=input.status==='approved'||input.status==='rejected'?'brokerage.finance.approve':['processing','completed','paid','reversed'].includes(input.status)?'brokerage.finance.process':'brokerage.finance.write';
      const scope=await context.staff(request,permission,true);
      if(['approved','processing','completed','paid','reversed'].includes(input.status))await context.highRisk(request,scope);
      return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).changePaymentStatus(scope,kind,id,input)}));
    });
    app.post(`${client}/${resource}/:id/status`,async(request,reply)=>{
      moneyMutation(request);const input=paymentStatusSchema.parse(request.body);const scope=await context.client(request,true);const id=identifier(request);
      return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).changePaymentStatus(scope,kind,id,input,true)}));
    });
    if(kind!=='transfer')app.post(`${admin}/${resource}/:id/review`,async(request,reply)=>{
      moneyMutation(request);const scope=await context.staff(request,'brokerage.finance.approve',true);const id=identifier(request);
      return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).reviewPayment(scope,kind,id,request.body)}));
    });
  }
  app.get(`${admin}/withdrawals/:id/destination`,async request=>{
    const scope=await context.staff(request,'brokerage.finance.process');await context.highRisk(request,scope);
    return {data:await new BrokerageFinanceService(context.db).paymentDestination(scope,identifier(request))};
  });
  app.get(`${admin}/transactions`,async request=>new BrokerageFinanceService(context.db).listPayments(await context.staff(request,'brokerage.finance.read'),'transactions',financeListSchema.parse(request.query)));
  app.get(`${client}/transactions`,async request=>new BrokerageFinanceService(context.db).listPayments(await context.client(request),'transactions',clientListSchema.parse(request.query),true));

  for(const resource of ['partners','referrals','commission-plans','accruals','payouts'] as const)app.get(`${admin}/${resource}`,async request=>new BrokerageFinanceService(context.db).listPartners(await context.staff(request,resource==='payouts'?'brokerage.finance.read':'brokerage.partners.read'),resource,financeListSchema.parse(request.query)));
  app.get(`${client}/ib`,async request=>({data:await new BrokerageFinanceService(context.db).ownIb(await context.client(request))}));
  app.post(`${admin}/partners`,async(request,reply)=>{
    const scope=await context.staff(request,'brokerage.partners.write',true);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).applyPartner(scope,request.body)}));
  });
  app.post(`${client}/ib/apply`,async(request,reply)=>{
    const body=ownBody(request);const scope=await context.client(request,true);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).applyPartner(scope,body,true)}));
  });
  app.post(`${admin}/partners/:id/status`,async(request,reply)=>{
    const input=partnerStatusSchema.parse(request.body);const scope=await context.staff(request,'brokerage.partners.write',true);const id=identifier(request);
    if(input.status==='approved')await context.highRisk(request,scope);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).changePartnerStatus(scope,id,input)}));
  });
  app.post(`${admin}/referrals`,async(request,reply)=>{
    const scope=await context.staff(request,'brokerage.partners.write',true);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).attributeReferral(scope,request.body)}));
  });
  app.post(`${client}/ib/attribution`,async(request,reply)=>{
    const body=ownBody(request);const scope=await context.client(request,true);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).attributeReferral(scope,body,true)}));
  });
  app.post(`${admin}/commission-plans`,async(request,reply)=>{
    const scope=await context.staff(request,'brokerage.partners.write',true);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).saveCommissionPlan(scope,request.body)}));
  });
  app.patch(`${admin}/commission-plans/:id`,async(request,reply)=>{
    const scope=await context.staff(request,'brokerage.partners.write',true);const id=identifier(request);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).saveCommissionPlan(scope,request.body,id)}));
  });
  app.post(`${admin}/partners/:id/plan`,async(request,reply)=>{
    const input=z.object({commission_plan_id:z.uuid()}).strict().parse(request.body);const scope=await context.staff(request,'brokerage.partners.write',true);const id=identifier(request);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).assignPartnerPlan(scope,id,input.commission_plan_id)}));
  });
  app.post(`${admin}/accruals`,async(request,reply)=>{
    moneyMutation(request);const scope=await context.staff(request,'brokerage.partners.write',true);await context.highRisk(request,scope);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).createAccrual(scope,request.body)}));
  });
  app.get(`${client}/payouts`,async request=>new BrokerageFinanceService(context.db).listPartners(await context.client(request),'payouts',clientListSchema.parse(request.query),true));
  app.post(`${admin}/payouts`,async(request,reply)=>{
    moneyMutation(request);const scope=await context.staff(request,'brokerage.finance.write',true);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).createPayout(scope,request.body)}));
  });
  app.post(`${client}/payouts`,async(request,reply)=>{
    moneyMutation(request);const body=ownBody(request,['partner_id','client_id']);const scope=await context.client(request,true);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).createPayout(scope,body,true)}));
  });
  app.post(`${admin}/payouts/:id/review`,async(request,reply)=>{
    moneyMutation(request);const scope=await context.staff(request,'brokerage.finance.approve',true);const id=identifier(request);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).reviewPayout(scope,id,request.body)}));
  });
  app.post(`${admin}/payouts/:id/status`,async(request,reply)=>{
    moneyMutation(request);const input=paymentStatusSchema.parse(request.body);const id=identifier(request);
    const permission=['approved','rejected'].includes(input.status)?'brokerage.finance.approve':['processing','paid'].includes(input.status)?'brokerage.finance.process':'brokerage.finance.write';
    const scope=await context.staff(request,permission,true);if(['approved','processing','paid'].includes(input.status))await context.highRisk(request,scope);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).changePayoutStatus(scope,id,input)}));
  });
  app.post(`${client}/payouts/:id/status`,async(request,reply)=>{
    moneyMutation(request);const scope=await context.client(request,true);const id=identifier(request);
    return context.atomic(request,reply,scope,async bound=>({data:await new BrokerageFinanceService(bound).changePayoutStatus(scope,id,request.body,true)}));
  });
  app.get(`${admin}/payouts/:id/destination`,async request=>{
    const scope=await context.staff(request,'brokerage.finance.process');await context.highRisk(request,scope);
    return {data:await new BrokerageFinanceService(context.db).payoutDestination(scope,identifier(request))};
  });
}
