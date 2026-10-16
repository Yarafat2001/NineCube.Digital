import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { seedPassword, seedPasswordMissing } from './seed-password';
test.describe('compact staff organization', () => {
  test.skip(!seedPassword, seedPasswordMissing);
  for (const theme of ['light','dark']) for (const width of [390,1440]) test(`${width}px ${theme}: category dialog and compact views`, async ({page, request}) => {
    const response=await request.post('http://127.0.0.1:5080/api/auth/login',{data:{email:'staff@ninecube.demo',password:seedPassword}});
    expect(response.ok()).toBeTruthy(); const session=await response.json();
    await page.addInitScript(({session,theme})=>{sessionStorage.setItem('ninecube.auth.session',JSON.stringify(session));localStorage.setItem('ninecube-theme',theme);},{session,theme});
    await page.setViewportSize({width,height:1000}); await page.goto('/staff');
    await expect(page.getByRole('heading',{name:'Order console',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Categories & product organization'})).toHaveCount(0);
    if(width>768) {
      const select=(await page.getByRole('button',{name:'Manage categories',exact:true}).boundingBox())!;
      const action=(await page.getByRole('link',{name:'Sales summary',exact:true}).boundingBox())!;
      expect(Math.abs(select.y+select.height-action.y-action.height)).toBeLessThan(3);
    }
    await page.getByRole('button',{name:'Manage categories',exact:true}).click();
    const manager=page.locator('.category-manager');
    await expect(manager.locator('tbody tr')).toHaveCount(8);
    await expect(page.getByRole('form',{name:'Category editor'})).toHaveCount(0);
    await page.getByRole('searchbox',{name:'Find a category'}).fill('Electronics');
    const edit=page.getByRole('button',{name:'Edit Electronics',exact:true}); await edit.hover();
    await expect(edit).toHaveCSS('cursor','pointer'); await edit.click();
    const dialog=page.getByRole('dialog',{name:'Edit Electronics',exact:true}); await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Category name')).toHaveValue('Electronics');
    expect((await dialog.boundingBox())!.height).toBeLessThan(1000);
    await expect(dialog.getByLabel('Active category')).toHaveCSS('width','18px');
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(edit).toBeFocused();
    await page.getByRole('button',{name:'Create category',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Create category',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Close dialog'}).click();
    await page.getByRole('button',{name:'Product categories & tags',exact:true}).click();
    await expect(page.getByRole('searchbox',{name:'Find a product'})).toBeVisible();
    await expect(page.getByRole('searchbox',{name:'Find a category'})).toBeHidden();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
    await page.getByRole('button',{name:'Categories & stock',exact:true}).click();
    await page.getByRole('searchbox',{name:'Find a category'}).fill('');
    await page.evaluate(()=>window.scrollTo(0,0));
    mkdirSync('artifacts/modern',{recursive:true});await page.screenshot({path:`artifacts/modern/staff-organization-${width}-${theme}.png`,fullPage:true});
  });
});
