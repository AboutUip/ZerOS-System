/// <summary>
/// 上传文件
/// </summary>
/// <returns></returns>
[HttpPost]
//备份之前
public async Task<IActionResult> Upload()
{
    var files = Request.Form.Files;
    var uploadedList = new List<IceEditorUploadOutput>();
    var size = files.Sum(f => f.Length);            
    //总大小超过100MB 禁止上传
    if (size > 104857600)
    {
        uploadedList.Add(new IceEditorUploadOutput
        {
            error = $"上传的文件不能超过100MB",
            url = "",
            name = ""
        });
        return Ok(uploadedList);
    }            
    var filePathResultList = new List<string>();            

    // 保存到网站根目录下的 uploads 目录
    // 按年+月放置
    var firstFolder = DateTime.Today.ToString("yyyy");
    var secondFolder = DateTime.Today.ToString("MM");
    var uploadPath = Path.Combine(App.HostEnvironment.ContentRootPath, "wwwroot", "upload");
    if (!Directory.Exists(uploadPath)) Directory.CreateDirectory(uploadPath);
    var firstPath = Path.Combine(uploadPath, firstFolder);
    if (!Directory.Exists(firstPath)) Directory.CreateDirectory(firstPath);
    var secondPath = Path.Combine(firstPath, secondFolder);
    if (!Directory.Exists(secondPath)) Directory.CreateDirectory(secondPath);
    
    foreach (var thisFile in files)
    {
        var fileName = ContentDispositionHeaderValue.Parse(thisFile.ContentDisposition).FileName.Trim('"');
        //如果没有后缀名，则添加png
        if (string.IsNullOrEmpty(Path.GetExtension(fileName)))
        {
            fileName += ".png";
        }
        string saveFileName = "";
        if (thisFile.Length > 0)
        {
            // 避免文件名重复，采用 GUID 生成
            saveFileName = Guid.NewGuid().ToString("N") + Path.GetExtension(fileName);
            var filePath = Path.Combine(secondPath, saveFileName);
            using (var stream = System.IO.File.Create(filePath))
            {
                await thisFile.CopyToAsync(stream);
            }
        }
        uploadedList.Add(new IceEditorUploadOutput
        {
            url = $"/upload/{firstFolder}/{secondFolder}/{saveFileName}",
            name = fileName,
            error = 0
        });
    }            
    return Ok(uploadedList);
}
class IceEditorUploadOutput
{
    public string url { get; set; }
    public string name { get; set; }
    public object error { get; set; }
}