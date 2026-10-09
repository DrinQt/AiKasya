import {test,expect} from '@playwright/test';
const routes=['welcome','home','chat','meals','grocery','pantry','insights','more','recipe','budget','market'];
for(const language of ['en','fil']){
 test(`Every screen fits mobile and desktop in ${language}`,async({page})=>{
  await page.goto('/');
  await page.evaluate(lang=>{const state=JSON.parse(localStorage.getItem('aikasya.v1')!);state.language=lang;state.started=true;localStorage.setItem('aikasya.v1',JSON.stringify(state));},language);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang',language);
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:844});
   for(const route of routes){
    await page.goto(`/#${route}`);
    await expect(page.locator('main')).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} at ${width}px in ${language}`).toBe(true);
    const overflow=await page.locator('main').evaluate(main=>{const bounds=main.getBoundingClientRect();return [...main.querySelectorAll('button,input,select')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left<bounds.left-1||r.right>bounds.right+1);}).map(el=>el.textContent);});
    expect(overflow,`${route} controls at ${width}px in ${language}`).toEqual([]);
    if(width===390&&language==='en')await page.screenshot({path:`screenshots/${route}.png`,fullPage:true});
   }
  }
 });
}
test('Browser back follows navigation',async({page})=>{await page.goto('/#home');await page.getByRole('button',{name:'Grocery List',exact:true}).click();await expect(page).toHaveURL(/#grocery$/);await page.goBack();await expect(page.getByRole('heading',{name:'Hello!'})).toBeVisible();});
test('Clear data requires explicit confirmation',async({page})=>{await page.goto('/#more');await page.getByRole('button',{name:'Clear Data',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Clear saved data',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Clear Data',exact:true}).click();await page.getByRole('button',{name:'Clear saved data',exact:true}).click();await expect(page.getByRole('heading',{name:'Hello!'})).toBeVisible();});
