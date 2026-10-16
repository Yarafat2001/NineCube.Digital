import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { seedPassword, seedPasswordMissing } from './seed-password';
test.describe('bulk order console',()=>{
 test.skip(!seedPassword,seedPasswordMissing);
 for(const width of [390,1440]) test(`${width}px: review and partial conflicts`,async({page,request})=>{
  const login=await request.post('http://127.0.0.1:5080/api/auth/login',{data:{email:'staff@ninecube.demo',password:seedPassword}});expect(login.ok()).toBeTruthy();const session=await login.json();
  await page.addInitScript(s=>{sessionStorage.setItem('ninecube.auth.session',JSON.stringify(s));localStorage.setItem('ninecube-theme','dark');},session);
  let rows=['Pending','Pending','Confirmed','Shipped'].map((status,i)=>({id:9001+i,customerId:1,customerName:'Bulk review fixture',status,currency:'BDT',totalAmount:100,createdAt:'2026-10-16T08:00:00Z',updatedAt:'2026-10-16T08:00:00Z',idempotencyKey:null,items:[]}));
  const calls:string[]=[];
  await page.route('**/api/orders?*',route=>{const status=new URL(route.request().url()).searchParams.get('status');const items=status?rows.filter(o=>o.status===status):rows;return route.fulfill({json:{items,page:1,pageSize:10,totalCount:items.length,totalPages:1,hasNext:false,hasPrevious:false}});});
  await page.route('**/api/orders/*/*',async route=>{
   if(route.request().method()!=='POST') return route.continue();
   const path=new URL(route.request().url()).pathname;calls.push(path);
   if(path==='/api/orders/9002/confirm') return route.fulfill({status:409,json:{type:'about:blank',title:'Conflict',status:409,detail:'Order changed state before the bulk update.',code:'invalid_order_state'}});
   if(path!=='/api/orders/9001/confirm') return route.fulfill({status:400,json:{title:'Unexpected fixture mutation',status:400}});
   rows=rows.map(r=>r.id===9001?{...r,status:'Confirmed'}:r);return route.fulfill({json:rows[0]});
  });
  await page.setViewportSize({width,height:1000});await page.goto('/staff');
  await expect(page.getByRole('region',{name:'Order status workflow'})).toHaveCount(0);
  await expect(page.getByRole('columnheader',{name:'Invoice'})).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'Select order #9003'})).toHaveCount(0);
  await page.getByRole('button',{name:'To ship',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Select order #9003'})).toBeVisible();
  await page.getByRole('checkbox',{name:'Select all confirmed orders on this page'}).check();
  await expect(page.getByLabel('Action',{exact:true})).toHaveValue('ship');
  await page.getByRole('button',{name:'Invoices & history',exact:true}).click();
  await expect(page.getByRole('link',{name:/View invoice for order/})).toHaveCount(4);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button',{name:'To confirm',exact:true}).click();
  await page.getByRole('checkbox',{name:'Select order #9001'}).check();await page.getByRole('checkbox',{name:'Select order #9002'}).check();
  await page.getByLabel('Action',{exact:true}).selectOption('confirm');await page.getByRole('button',{name:'Review bulk update'}).click();
  const dialog=page.getByRole('dialog',{name:'Review bulk order update'});await expect(dialog).toContainText('Order #9001 - Pending');await expect(dialog).toContainText('Order #9002 - Pending');expect(calls).toHaveLength(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  mkdirSync('artifacts/modern',{recursive:true});await page.screenshot({path:`artifacts/modern/staff-order-bulk-${width}.png`});
  await dialog.getByRole('button',{name:'Apply bulk update'}).click();await expect(page.getByText('1 updated; 1 failed.')).toBeVisible();
  await expect(page.getByText(/Order #9002:.*changed state/)).toBeVisible();expect(calls).toEqual(['/api/orders/9001/confirm','/api/orders/9002/confirm']);
 });
});
