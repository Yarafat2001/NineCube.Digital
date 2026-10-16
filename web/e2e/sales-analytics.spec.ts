import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { seedPassword, seedPasswordMissing } from './seed-password';
test.describe('sales analytics',()=>{
 test.skip(!seedPassword,seedPasswordMissing);
 for(const theme of ['light','dark']) for(const width of [390,1440]) test(`${width}px ${theme}: real report charts and filters`,async({page,request})=>{
  const login=await request.post('http://127.0.0.1:5080/api/auth/login',{data:{email:'staff@ninecube.demo',password:seedPassword}});
  expect(login.ok()).toBeTruthy();const session=await login.json();
  await page.addInitScript(({session,theme})=>{sessionStorage.setItem('ninecube.auth.session',JSON.stringify(session));localStorage.setItem('ninecube-theme',theme);},{session,theme});
  await page.setViewportSize({width,height:1000});
  const loaded=page.waitForResponse(r=>r.url().includes('/api/reports/sales?')&&r.ok());
  await page.goto('/staff/sales');const data=await (await loaded).json();
  await expect(page.getByRole('heading',{name:'Sales summary',exact:true})).toBeVisible();
  const cards=page.locator('.sales-stats .card-glass');await expect(cards).toHaveCount(3);
  await expect(page.locator('.sales-stats .stat-icon')).toHaveCount(3);
  await expect(cards.first()).toHaveCSS('position','relative');
  await expect(cards.first().locator('.stat-tile__value')).toHaveText(String(data.totalOrders));
  await expect(page.locator('.sales-charts').getByRole('img')).toBeVisible();
  await expect(page.locator('.sales-donut__total')).toHaveText(String(data.byStatus.reduce((n:number,r:{orderCount:number})=>n+r.orderCount,0)));
  await expect(page.getByRole('list',{name:'Revenue by status values'}).getByRole('listitem')).toHaveCount(data.byStatus.length);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  mkdirSync('artifacts/modern',{recursive:true});await page.screenshot({path:`artifacts/modern/sales-${width}-${theme}.png`,fullPage:true});
  await page.getByLabel('Currency',{exact:true}).selectOption('USD');
  const changed=page.waitForResponse(r=>r.url().includes('/api/reports/sales?')&&r.url().includes('currency=USD')&&r.ok());
  await page.getByRole('button',{name:'Apply range'}).click();await changed;
  await expect(page.locator('.sales-chart').last()).toContainText('USD revenue');
 });
});
