import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('anonymous admin and draft preview require login',async({page})=>{
  for(const path of ['/admin','/admin/drops','/admin/drops/new','/admin/drops/00000000-0000-0000-0000-000000000000/preview']){
    await page.goto(path);await expect(page).toHaveURL(/\/admin\/login/);await expect(page.getByRole('heading',{name:'Iniciar sesión'})).toBeVisible();
  }
});
test('login is accessible and usable on small screens',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/admin/login');
  await expect(page.getByLabel('Email',{exact:true})).toBeVisible();await expect(page.getByLabel('Contraseña',{exact:true})).toHaveAttribute('type','password');
  const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(a11y.violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
