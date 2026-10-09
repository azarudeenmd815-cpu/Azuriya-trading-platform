# White-label configuration

Brand configuration is stored as validated JSONB on `brands`, scoped to the organization. Product instances reference the brand and environment, so branding changes propagate across purchased products using that brand. Tenant portal shells resolve the brand through server-authorized instance context. Branding forms persist to the API, then refresh the resolved context.

Configuration supports business/product names, standard/dark/light logos, favicon, primary/secondary/accent/background colors, typography, support email and URL, legal URLs, social links, login/email configuration, enabled module/navigation configuration, footer and legal notices. Fields define the future shared branding contract; browser shells apply supported visual fields while email rendering and arbitrary navigation customization await their modules.

The Core shell identifies the Azuriya platform; business and client shells use their business brand. Asset inputs accept HTTP/HTTPS URLs and do not fabricate an object-store upload flow. Object storage must later implement a tenant-owned asset reference interface with signed upload policy, content inspection and CDN delivery. URLs and colors are validated; tenant text is rendered as text, never injected as HTML or executable CSS.

Authentication uses a shared sign-in foundation. Custom-host login branding can be connected after the domain edge/SSL pipeline is real. Brand configuration cannot substitute for tenancy or authorization, and an unverified domain cannot select an active tenant application.
