import {test,expect} from '@playwright/test';
import {waitForModel} from './model-ready-helper.js';

test('素材交互组件菜单/快捷键共享意图，销毁不残留监听',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 const result=await page.evaluate(async()=>{
  const {bindLibraryInteractions,libraryIdentity}=await import('/labs/motion/ui/library-interactions.js');
  const host=document.createElement('div');host.innerHTML='<div class="library-entry"><button data-pose-id="p">姿势</button></div>';document.body.append(host);
  const row=host.querySelector('button'),calls=[];
  const view=bindLibraryInteractions({container:host,getMenu:()=>({kind:'pose',copyDisabled:false,pasteDisabled:false}),showMenu:(event,items)=>{calls.push(items[1].name);items[0].run();},extraMenu:()=>[],onCopy:node=>calls.push(libraryIdentity(node)),onPaste:()=>calls.push('paste'),onRename:()=>calls.push('rename'),onDelete:()=>calls.push('delete')});
  row.dispatchEvent(new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true}));row.dispatchEvent(new KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true}));
  row.dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true}));row.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}));row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
  const count=calls.length;view.dispose();row.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}));row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));host.remove();return {calls,disposed:calls.length===count};
 });
 expect(result).toEqual({calls:[{kind:'pose',id:'p'},'paste','rename','delete','粘贴到自定义姿势库（Ctrl+V）',{kind:'pose',id:'p'}],disposed:true});
});

test('独立素材库组件：搜索/焦点、共享行、源按钮复用及销毁隔离',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 await page.evaluate(async()=>{
  const {createLibraryView}=await import('/labs/motion/ui/library-view.js');
  const host=document.createElement('section');host.id='libraryComponentFixture';
  host.innerHTML='<button data-actions>动作</button><button data-poses>姿势</button><button data-append>导入</button><input data-search><output data-count></output><div id="fixtureAssets"></div>';
  document.body.append(host);
  const get=selector=>host.querySelector(selector),calls=[];
  const view=createLibraryView({
   elements:{container:get('#fixtureAssets'),search:get('[data-search]'),count:get('[data-count]'),actionsTab:get('[data-actions]'),poseTab:get('[data-poses]'),appendButton:get('[data-append]')},
   icons:{pencil:'R','trash-2':'D'},onTab:key=>calls.push('tab:'+key),onActionGroup:key=>calls.push('group:'+key),onPreview:entry=>calls.push('preview:'+entry.kind),onEditPose:entry=>calls.push('edit:'+entry.id),onRename:()=>calls.push('rename'),onDelete:()=>calls.push('delete')
  });
  view.setSources([{kind:'source',index:0,name:'站立',clipName:'Idle',searchName:'站立 Idle',meta:'2.00 s'}]);
  const source=get('[data-clip-index]');
  const model={tab:'action',count:2,groups:[
   {id:'fixture-default',key:'default',label:'默认',open:true,entries:[{kind:'source',index:0}],empty:'空'},
   {id:'fixture-custom',key:'custom',label:'自定义',open:true,entries:[{kind:'custom',id:'test-action',name:'测试动作',meta:'3.00 s'}],empty:'空'}
  ]};
  const render=()=>view.render(model,()=>{});render();
  globalThis.libraryFixture={view,model,source,render,calls};
 });
 const host=page.locator('#libraryComponentFixture'),custom=host.locator('[data-custom-id]');
 await host.locator('[data-search]').fill('不存在');await expect(host.locator('#librarySearchEmpty')).toHaveText('没有匹配的素材');
 await host.locator('[data-search]').fill('测试');await expect(custom).toBeVisible();await expect(host.locator('#fixture-default').locator('..')).toBeHidden();
 await host.locator('[data-search]').fill('');await expect(host.locator('#fixture-default').locator('..')).toBeVisible();
 await custom.focus();await page.evaluate(()=>libraryFixture.render());await expect(custom).toBeFocused();
 await host.locator('.library-rename').click();await host.locator('.library-delete').click();
 expect(await page.evaluate(()=>libraryFixture.calls)).toEqual(['rename','delete']);
 expect(await page.evaluate(()=>libraryFixture.source===document.querySelector('#libraryComponentFixture [data-clip-index]'))).toBe(true);
 await host.locator('[data-actions]').click();expect(await page.evaluate(()=>libraryFixture.calls.at(-1))).toBe('tab:default');
 const searchEmpty=await page.evaluate(()=>{
  const search=document.querySelector('#libraryComponentFixture [data-search]');
  libraryFixture.view.dispose();search.value='不存在';search.dispatchEvent(new Event('input'));
  document.querySelector('#libraryComponentFixture [data-actions]').click();
  return {empty:!!document.querySelector('#libraryComponentFixture #librarySearchEmpty'),calls:libraryFixture.calls};
 });
 expect(searchEmpty.empty).toBe(false);expect(searchEmpty.calls).toEqual(['rename','delete','tab:default']);
 await expect(host.locator('#fixtureAssets')).toBeEmpty();
 await page.evaluate(()=>{document.querySelector('#libraryComponentFixture').remove();delete globalThis.libraryFixture;});
});
