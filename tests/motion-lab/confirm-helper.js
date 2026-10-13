export async function handleConfirmation(page,accept=true,once=true){
 await page.addLocatorHandler(page.locator('#motionConfirmDialog'),async dialog=>{await dialog.locator(accept?'button.primary':'.dialog-actions button:not(.primary)').click();},once?{times:1}:{});
}
