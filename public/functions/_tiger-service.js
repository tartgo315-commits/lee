// Legacy paid OCR endpoint is retired. Screenshots are processed in the browser.
export async function handleTiger(request){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(request.method==='GET')return Response.json({ready:true,mode:'browser-ocr',requiresApiKey:false},{headers});
 return Response.json({error:'截图导入已切换免费浏览器识别，请刷新网页后重试。',mode:'browser-ocr'},{status:410,headers});
}
