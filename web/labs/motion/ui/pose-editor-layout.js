// 仅组织编辑与播放区域；原按钮、事件和草稿保护不复制。
export function bindPoseEditorLayout({stage,icons}){
 const viewport=stage.closest('.viewport'),head=viewport.querySelector('.view-head>div');
 const edit=document.getElementById('editPose'),save=document.getElementById('capturePose');
 const workspace=document.createElement('div');workspace.className='pose-workspace';
 const scene=document.createElement('div');scene.className='pose-scene';
 stage.before(workspace);scene.append(stage);workspace.append(scene);
 const panel=document.createElement('aside');panel.id='viewportPoseTools';panel.setAttribute('role','region');panel.setAttribute('aria-label','姿势编辑');
 const title=document.createElement('h2');title.className='pose-editor-heading';title.textContent='姿势编辑';
 const content=document.createElement('div');content.id='poseEditorContent';
 const history=document.createElement('div');history.className='pose-edit-tools';history.setAttribute('role','group');history.setAttribute('aria-label','编辑历史');
 history.append(document.getElementById('undoDrag'),document.getElementById('resetPose'));
 for(const [id,icon,label] of [['undoDrag','undo-2','撤销拖动'],['resetPose','rotate-ccw','初始姿势']]){
  const button=history.querySelector('#'+id);button.innerHTML=icons[icon];button.setAttribute('aria-label',label);button.title=label;button.classList.add('icon-button');
 }
 content.append(history);
 panel.append(title,content);workspace.append(panel);
 head.append(save,edit);edit.setAttribute('aria-controls','viewportPoseTools');
 function sync(editing){
  edit.textContent=editing?'退出编辑':'编辑姿势';edit.setAttribute('aria-pressed',String(editing));
 }
 sync(false);
 return {sync};
}
