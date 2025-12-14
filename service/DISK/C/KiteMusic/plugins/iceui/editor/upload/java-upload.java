/*
    依赖:
    <dependency>
        <groupId>commons-io</groupId>
        <artifactId>commons-io</artifactId>
        <version>2.4</version>
    </dependency>
    <dependency>
        <groupId>commons-fileupload</groupId>
        <artifactId>commons-fileupload</artifactId>
        <version>1.3.1</version>
    </dependency>
    <dependency>
        <groupId>org.apache.httpcomponents</groupId>
        <artifactId>httpcore</artifactId>
        <version>4.4.14</version>
    </dependency>
    <dependency>
        <groupId>net.sf.ezmorph</groupId>
        <artifactId>ezmorph</artifactId>
        <version>1.0.6</version>
    </dependency>
    <dependency>
        <groupId>net.sf.json-lib</groupId>
        <artifactId>json-lib</artifactId>
        <version>2.4</version>
        <classifier>jdk15</classifier>
    </dependency>
 */
package com.slpchina.site.controller;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.UUID;

import org.apache.commons.io.FileUtils;
import org.apache.http.entity.ContentType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;

import net.sf.json.JSONArray;
import net.sf.json.JSONObject;

@Controller
public class FileController {
	
	//改成你的文件存储路径，结尾别忘加斜杠
	private String filePath = "C:/Users/";
	
	//文件上传
	@RequestMapping(value="/uploadFile")
	@ResponseBody
	public JSONArray uploadFile(@RequestParam(value="file[]")MultipartFile file[]) throws IOException {
		FileInputStream fileInputStream = null;
		//创建JSON数组，返回一组url和name，告诉编辑器上传的图片路径
		JSONArray jsonArray = new JSONArray();
		try {
			//循环为编辑器传来的图片改名
			for(int i=0;i<file.length;i++) {
				String uuid = UUID.randomUUID().toString().replaceAll("-","");
				
				//获取文件后缀名，并拼接UUID和后缀名
				String suffix = file[i].getOriginalFilename().substring(file[i].getOriginalFilename().lastIndexOf("."));
				File newFile = new File(uuid + suffix);
				FileUtils.copyInputStreamToFile(file[i].getInputStream(), newFile);
				fileInputStream = new FileInputStream(newFile);
				file[i] = new MockMultipartFile(newFile.getName(), newFile.getName(),ContentType.APPLICATION_OCTET_STREAM.toString(), fileInputStream);
				
				//调用fileService的上传方法
				upload(file[i]);
				
				//创建JSON对象并加入JSON数组
				JSONObject jsonObject = new JSONObject();
				jsonObject.put("url", "/file/" + file[i].getOriginalFilename());
				jsonObject.put("name", file[i].getOriginalFilename());
				jsonObject.put("error", 0);
				jsonArray.add(jsonObject);
			}
		
		} catch (FileNotFoundException e) {
			e.printStackTrace();
		} catch (IOException e) {
			e.printStackTrace();
		} finally {
			if(fileInputStream != null) {
				try {
					fileInputStream.close();
				} catch (IOException e) {
					e.printStackTrace();
				}
			}
		}
		return jsonArray;
	}
	
	public void upload(MultipartFile upload) {
		String fileName = upload.getOriginalFilename();
		File file = new File(filePath);
		if(!file.exists()) file.mkdirs();
		String newFilePath=filePath+fileName;
		try {
			upload.transferTo(new File(newFilePath));
		} catch (IllegalStateException | IOException e) {
			e.printStackTrace();
		}
	}
}