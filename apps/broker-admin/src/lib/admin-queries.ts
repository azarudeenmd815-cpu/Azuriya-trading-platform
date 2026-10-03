"use client";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { adminApi, write } from "./api";
export function useResource<T>(path:string, enabled=true) { return useQuery({queryKey:["admin",path],queryFn:()=>adminApi<T>(path),enabled,refetchInterval:15000}); }
export function useCommand<T=unknown>(path:string,method="POST") { const client=useQueryClient(); return useMutation({mutationFn:(input:{body:unknown;key?:string})=>write<T>(path,input.body,method,input.key),onSuccess:()=>client.invalidateQueries({queryKey:["admin"]})}); }

