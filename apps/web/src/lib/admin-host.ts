/** Host allowlisting is shared by the proxy, server layout and staff BFF. */
export function isAdminHost(host:string|null,origin=process.env.ADMIN_ORIGIN??"http://admin.localhost:3000"):boolean {try{return !!host&&host.toLowerCase()===new URL(origin).host.toLowerCase();}catch{return false;}}
