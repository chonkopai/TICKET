import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

for (const path of ["/me/events?status=upcoming&page=1&limit=10&locale=ru", "/me/orders?page=1", "/me/notifications", "/me", "/auth/google", "/orders/example", "/telegram/webhook", "/api/events", "/media/photo.png"]) {
  test(`API request bypasses page language redirect: ${path}`, () => {
    const response = proxy(new NextRequest(`https://ticket.example${path}`));
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("set-cookie"), null);
  });
}
test("pages still redirect to the preferred language", () => {
  const response = proxy(new NextRequest("https://ticket.example/account", { headers: { cookie: "ticket-locale=kk" } }));
  assert.equal(response.headers.get("location"), "https://ticket.example/account?lang=kk");
});
test("similar page names do not get mistaken for API routes", () => {
  const response = proxy(new NextRequest("https://ticket.example/account"));
  assert.equal(response.headers.get("location"), "https://ticket.example/account?lang=ru");
});
test("Telegram callback is neither redirected nor reflected into metadata URLs", () => {
  const response = proxy(new NextRequest("https://ticket.example/login/telegram/callback?state=private&code=secret"));
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-middleware-request-x-ticket-path"), "/login/telegram/callback");
  assert.equal(response.headers.get("x-middleware-request-x-ticket-locale"), "ru");
});

test("public hostname cannot serve staff pages or its BFF",()=>{
 for(const path of ["/admin","/admin/login","/staff-api/auth/session"]){const response=proxy(new NextRequest(`http://localhost:3000${path}`,{headers:{host:"localhost:3000"}}));assert.equal(response.status,404);}
});
test("admin hostname redirects to the staff console and rejects public authentication",()=>{
 const origin=process.env.ADMIN_ORIGIN??"http://admin.localhost:3000",host=new URL(origin).host;
 assert.equal(proxy(new NextRequest(`${origin}/`,{headers:{host}})).headers.get("location"),`${origin}/admin`);
 for(const path of ["/auth/password/login","/me","/organizer/events"]){assert.equal(proxy(new NextRequest(`${origin}${path}`,{headers:{host}})).status,404);}
});
test("staff BFF requests bypass page-only locale redirects",()=>{
 const origin=process.env.ADMIN_ORIGIN??"http://admin.localhost:3000",host=new URL(origin).host;
 const response=proxy(new NextRequest(`${origin}/staff-api/auth/session`,{headers:{host}}));assert.equal(response.headers.get("location"),null);assert.equal(response.headers.get("x-middleware-next"),"1");
});
