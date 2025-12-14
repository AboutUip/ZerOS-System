/**
 ************************************************************************
 * ice.code(代码高亮)
 * 作者：闫立峰
 * 官网：https://iceui.cn
 * 创建：2018-12-18
 * 更新：2023-06-08
 * MIT License By iceui.cn
 ************************************************************************
 * 版权声明：该版权完全归ICEUI官方所有，可转载使用和学习，但请务必保留版权信息
 ************************************************************************
 */
'use strict';
var ice = ice || {};
ice.loadCss = function (url) {
	var head = document.getElementsByTagName('head')[0];
	var link = document.createElement('link');
	link.type = 'text/css';
	link.rel = 'stylesheet';
	link.href = url;
	head.appendChild(link);
};

//模块链接地址
var moduleSrc = document.currentScript ? document.currentScript.src : document.scripts[document.scripts.length - 1].src;
//模块路径目录
var modulePath = moduleSrc.substring(0, moduleSrc.lastIndexOf('/') + 1);
//加载css
ice.loadCss(modulePath + 'iceCode.css');
ice.code = function (callback) {
	class iceCode {
		constructor(callback) {
			var ID = function () { return String.fromCharCode(65 + Math.ceil(Math.random() * 25)) };
			var RAND = ID() + ID() + ID();
			var that = this;
			this.LL = 'ICE' + RAND + 'LL', this.LR = 'ICE' + RAND + 'LR', this.RR = 'ICE' + RAND + 'RR', this.PL = 'ICE' + RAND + 'PL', this.PR = 'ICE' + RAND + 'PR', this.tagRegx = new RegExp(this.LL + '.*?' + this.LR + '(.*?)' + this.RR, 'g');
			//添加css
			this.setCss = function (css, data) { return that.LL + css + that.LR + data + that.RR };
			//特殊处理引号内的字符
			this.inQuotes = function (data, str, css) {
				data = data.split('\n');
				for (var i = 0; i < data.length; i++) {
					if (data[i].indexOf(str) !== -1) {
						//判断字符是否在引号里面
						var c = data[i].split(str), t = '', f = [];
						for (var d = 0; d < c.length - 1; d++) {
							f.push(c[d]);
							t += c[d];
							if (t.split(this.LL).length === t.split(this.RR).length) {
								var g = [];
								for (var e = d + 1; e < c.length; e++) g.push(c[e]);
								//清除里面的所有正则过的标签 
								var k = g.join(str).replace(that.tagRegx, '$1');
								data[i] = f.join(str) + that.setCss(css, str + k);
								break;
							}
						}
					}
				}
				return data.join('\n');
			}
			//正则库
			this.regexLib = {
				doubleQuotes: /("(\\"|.)*?")/g,			//双引号
				singleQuotes: /('(\\'|.)*?')/g,			//单引号
				number: /\b([\d]+)\b/g,				//数字
				bracket: /([\(|\)|\{|\}]+)/g,			//括号
				operator: /([\+|\-|\=|\*|\%]+)/g,		//运算符
				url: /(\w+:\/\/[\w-.\/?%&=:@;]*)/g,//url
				//html多行注释 <!-- …… -->
				htmlComment: function (data, css) {
					return data.replace(/(\&lt;|<)!--(.|\n)*?--(\&gt;|>)/g, function (a) {
						a = a.replace(that.tagRegx, '$1');
						a = a.split('\n');
						for (var i = 0; i < a.length; i++)
							a[i] = that.setCss(css, a[i]);
						return a.join('\n');
					});
				},
				//xml多行注释 <![ …… [ …… ]]>
				xmlComment: function (data, css) {
					return data.replace(/(\&lt;|<)!\[(\w|\s)*?\[(.|\s)*?\]\](\&gt;|>)/g, function (a) {
						return that.setCss(css, a);
					});
				},
				//通用多行注释 /* …… */
				multiLineComment: function (data, css) {
					return data.replace(/\/\*(.|\n)*?\*\//g, function (a) {
						a = a.replace(that.tagRegx, '$1');
						a = a.split('\n');
						for (var i = 0; i < a.length; i++)
							a[i] = that.setCss(css, a[i]);
						return a.join('\n');
					});
				},
				//python多行注释 """ …… """
				pythonComment: function (data, css) {
					return data.replace(/["""|'''](.|\n)*?["""|''']/g, function (a) {
						a = a.replace(that.tagRegx, '$1');
						a = a.split('\n');
						for (var i = 0; i < a.length; i++)
							a[i] = that.setCss(css, a[i]);
						return a.join('\n');
					});
				},
				//单行注释 // ……
				singleLineComment: function (data, css) {
					return that.inQuotes(data, '//', css);
				},
				//单行注释 # ……
				singleLinePerlComment: function (data, css) {
					return that.inQuotes(data, '#', css);
				},
				//格式化html中script的js代码
				script: function (data, css) {
					return data.replace(/(<script[^>]*>)([\s\S]*?)(<\/\s*script>)/g, function () {
						if (arguments[2].trim().length) {
							return arguments[1] + that.toLanguage(arguments[2], 'js') + arguments[3];
						}
						return arguments[0];
					});
				},
			};
			//代码语言
			this.languages = {
				common: [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(and|break|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|eval|exit|for|foreach|function|global|if|include|namespace|new|or|private|protected|public|return|static|switch|try|while)\b/gi, css: 'keyword' },
				],
				php: [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.singleLinePerlComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /(\$\w+)/g, css: 'variable' },
					{ regex: /\b(__halt_compiler|abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|namespace|new|or|print|private|protected|public|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor)\b/gi, css: 'keyword' },
					{ regex: /\b(abs|acos|acosh|addcslashes|addslashes|array_change_key_case|array_chunk|array_combine|array_count_values|array_diff|array_diff_assoc|array_diff_key|array_diff_uassoc|array_diff_ukey|array_fill|array_filter|array_flip|array_intersect|array_intersect_assoc|array_intersect_key|array_intersect_uassoc|array_intersect_ukey|array_key_exists|array_keys|array_map|array_merge|array_merge_recursive|array_multisort|array_pad|array_pop|array_product|array_push|array_rand|array_reduce|array_reverse|array_search|array_shift|array_slice|array_splice|array_sum|array_udiff|array_udiff_assoc|array_udiff_uassoc|array_uintersect|array_uintersect_assoc|array_uintersect_uassoc|array_unique|array_unshift|array_values|array_walk|array_walk_recursive|atan|atan2|atanh|base64_decode|base64_encode|base_convert|basename|bcadd|bccomp|bcdiv|bcmod|bcmul|bindec|bindtextdomain|bzclose|bzcompress|bzdecompress|bzerrno|bzerror|bzerrstr|bzflush|bzopen|bzread|bzwrite|ceil|chdir|checkdate|checkdnsrr|chgrp|chmod|chop|chown|chr|chroot|chunk_split|class_exists|closedir|closelog|copy|cos|cosh|count|count_chars|date|decbin|dechex|decoct|deg2rad|delete|ebcdic2ascii|echo|empty|end|ereg|ereg_replace|eregi|eregi_replace|error_log|error_reporting|escapeshellarg|escapeshellcmd|eval|exec|exit|exp|explode|extension_loaded|feof|fflush|fgetc|fgetcsv|fgets|fgetss|file_exists|file_get_contents|file_put_contents|fileatime|filectime|filegroup|fileinode|filemtime|fileowner|fileperms|filesize|filetype|floatval|flock|floor|flush|fmod|fnmatch|fopen|fpassthru|fprintf|fputcsv|fputs|fread|fscanf|fseek|fsockopen|fstat|ftell|ftok|getallheaders|getcwd|getdate|getenv|gethostbyaddr|gethostbyname|gethostbynamel|getimagesize|getlastmod|getmxrr|getmygid|getmyinode|getmypid|getmyuid|getopt|getprotobyname|getprotobynumber|getrandmax|getrusage|getservbyname|getservbyport|gettext|gettimeofday|gettype|glob|gmdate|gmmktime|ini_alter|ini_get|ini_get_all|ini_restore|ini_set|interface_exists|intval|ip2long|is_a|is_array|is_bool|is_callable|is_dir|is_double|is_executable|is_file|is_finite|is_float|is_infinite|is_int|is_integer|is_link|is_long|is_nan|is_null|is_numeric|is_object|is_readable|is_real|is_resource|is_scalar|is_soap_fault|is_string|is_subclass_of|is_uploaded_file|is_writable|is_writeable|mkdir|mktime|nl2br|parse_ini_file|parse_str|parse_url|passthru|pathinfo|print|readlink|realpath|rewind|rewinddir|rmdir|round|str_ireplace|str_pad|str_repeat|str_replace|str_rot13|str_shuffle|str_split|str_word_count|strcasecmp|strchr|strcmp|strcoll|strcspn|strftime|strip_tags|stripcslashes|stripos|stripslashes|stristr|strlen|strnatcasecmp|strnatcmp|strncasecmp|strncmp|strpbrk|strpos|strptime|strrchr|strrev|strripos|strrpos|strspn|strstr|strtok|strtolower|strtotime|strtoupper|strtr|strval|substr|substr_compare)\b/gi, css: 'functions' },
				],
				'js javascript json': [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(break|delete|function|return|typeof|case|do|if|switch|var|let|const|catch|else|in|this|void|continue|false|instanceof|throw|while|debugger|finally|new|true|with|default|for|null|try)\b/gi, css: 'keyword' },
				],
				rust: [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|Self|self|static|struct|super|trait|true|type|union|unsafe|use|where|while)\b/gi, css: 'keyword' },
				],
				net: [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(addhandler|date|integer|raiseevent|addressof|declare|let|readonly|alias|dir|lib|removehandler|and|do|like|redim|andalso|double|long|resume|ansi|elseif|loop|return|as|each|me|rem|assembly|else|mod|select|auto|enum|module|set|byte|end|mustoverride|shadows|erase|mustinherit|laerlt|byref|mybase|short|byval|event|myclass|single|call|exit|namespace|static|case|explicit|new|step|c|atch|endif|next|stop|char|false|not|string|class|finally|nothing|structure|cbool|notlnheritable|sub|cbyte|foreach|notoverridable|synclock|cdate|for|null|then|cdbl|friend|obj|ect|throw|cdec|function|on|true|cint|get|option|try|clng|goto|optional|to|cobj|gettype|or|typeof|cshort|global|orelse|unicode|csng|go|overloads|until|str|handles|overridable|variant|ctype|if|overrides|while|const|implements|paramarray|with|decimal|imports|preserve|when|default|in|private|withevents|delegate|inherits|public|writeonly|dim|interface|property|xor|abstract|c|vdate|freefile|randomize|unionaccess|cverr|implicit|read|unsafe|andthen|database|imp|ref|using|any|，debug|implements|sealed|variant|append|defbool|input|sizeof|virtual|array|defbyte|instr|rgb|unknown|assert|defcur|int|rset|unload|assign|ling|scale|unlock|attribute|defdbl|lbound|seek|void|base|defdec|left|sgn|abs|byte|defint|len|shared|width|b|oolean|deflng|line|spc|write|cantoverride|defobj|lineinput|struct|ccur|defsng|load|switch|cdecl|defstr|lset|this|chdir|dewar|mid|step|checked|deprecated|mustoverride|stop|circle|doevents|operator|strcomp|var|object|async)\b/gi, css: 'keyword' },
				],
				go: [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(break|default|func|interface|select|case|defer|go|map|struct|chan|else|goto|package|switch|const|fallthrough|if|range|type|continue|for|import|return|var|append|bool|byte|cap|close|complex|complex64|complex128|uint16|copy|false|float32|float64|imag|int|int8|int16|uint32|int32|int64|iota|len|make|new|nil|panic|uint64|print|println|real|recover|string|true|uint|uint8|uintptr)\b/gi, css: 'keyword' },
				],
				java: [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(private|protected|public|default|abstract|class|extends|final|implements|interface|native|new|static|strictfp|synchronized|transient|volatile|break|case|switch|continue|default|do|else|for|if|instanceof|return|switch|while|assert|catch|finally|throw|throws|try|import|package|boolean|byte|char|double|float|int|long|short|super|this|void|goto|const|null)\b/gi, css: 'keyword' },
				],
				c: [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.singleLinePerlComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|unsigned|union|void|volatile|while|_Bool|_Complex|_Imaginary|inline|restrict|_Alignas|_Alignof|_Atomic|_Generic|_Noreturn|_Static_assert|_Thread_local)\b/gi, css: 'keyword' },
				],
				'cpp c++': [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.singleLinePerlComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(asm|else|new|this|auto|enum|operator|throw|bool|explicit|private|true|break|export|protected|try|case|extern|public|typedef|catch|false|register|typeid|char|float|reinterpret_cast|typename|class|for|return|union|const|friend|short|unsigned|const_cast|goto|signed|using|continue|if|sizeof|virtual|default|inline|static|void|delete|int|static_cast|volatile|do|long|struct|wchar_t|double|mutable|switch|while|dynamic_cast|namespace|template)\b/gi, css: 'keyword' },
				],
				'csharp c#': [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.singleLinePerlComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(abstract|as|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|goto|if|implicit|in|in|int|interface|internal|is|lock|long|namespace|new|null|object|operator|out|out|override|params|private|protected|public|readonly|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|virtual|void|volatile|while|add|alias|ascending|descending|dynamic|from|get|global|group|into|join|let|orderby|partial|type|partial|method|remove|select|set)\b/gi, css: 'keyword' },
				],
				sql: [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.singleLinePerlComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(ACCESSIBLE|ADD|ALL|ALTER|ANALYZE|AND|AS|ASC|ASENSITIVE|BEFORE|BETWEEN|BIGINT|BINARY|BLOB|BOTH|BY|CALL|CASCADE|CASE|CHANGE|CHAR|CHARACTER|CHECK|COLLATE|COLUMN|CONDITION|CONSTRAINT|CONTINUE|CONVERT|CREATE|CROSS|CURRENT_DATE|CURRENT_TIME|CURRENT_TIMESTAMP|CURRENT_USER|CURSOR|DATABASE|DATABASES|DAY_HOUR|DAY_MICROSECOND|DAY_MINUTE|DAY_SECOND|DEC|DECIMAL|DECLARE|DEFAULT|DELAYED|DELETE|DESC|DESCRIBE|DETERMINISTIC|DISTINCT|DISTINCTROW|DIV|DOUBLE|DROP|DUAL|EACH|ELSE|ELSEIF|ENCLOSED|ESCAPED|EXISTS|EXIT|EXPLAIN|FALSE|FETCH|FLOAT|FLOAT4|FLOAT8|FOR|FORCE|FOREIGN|FROM|FULLTEXT|GET|GRANT|GROUP|HAVING|HIGH_PRIORITY|HOUR_MICROSECOND|HOUR_MINUTE|HOUR_SECOND|IF|IGNORE|IN|INDEX|INFILE|INNER|INOUT|INSENSITIVE|INSERT|INT|INT1|INT2|INT3|INT4|INT8|INTEGER|INTERVAL|INTO|IO_AFTER_GTIDS|IO_BEFORE_GTIDS|IS|ITERATE|JOIN|KEY|KEYS|KILL|LEADING|LEAVE|LEFT|LIKE|LIMIT|LINEAR|LINES|LOAD|LOCALTIME|LOCALTIMESTAMP|LOCK|LONG|LONGBLOB|LONGTEXT|LOOP|LOW_PRIORITY|MASTER_BIND|MASTER_SSL_VERIFY_SERVER_CERT|MATCH|MAXVALUE|MEDIUMBLOB|MEDIUMINT|MEDIUMTEXT|MIDDLEINT|MINUTE_MICROSECOND|MINUTE_SECOND|MOD|MODIFIES|NATURAL|NOT|NO_WRITE_TO_BINLOG|NULL|NUMERIC|ON|OPTIMIZE|OPTION|OPTIONALLY|OR|ORDER|OUT|OUTER|OUTFILE|PARTITION|PRECISION|PRIMARY|PROCEDURE|PURGE|RANGE|READ|READS|READ_WRITE|REAL|REFERENCES|REGEXP|RELEASE|RENAME|REPEAT|REPLACE|REQUIRE|RESIGNAL|RESTRICT|RETURN|REVOKE|RIGHT|RLIKE|SCHEMA|SCHEMAS|SECOND_MICROSECOND|SELECT|SENSITIVE|SEPARATOR|SET|SHOW|SIGNAL|SMALLINT|SPATIAL|SPECIFIC|SQL|SQLEXCEPTION|SQLSTATE|SQLWARNING|SQL_BIG_RESULT|SQL_CALC_FOUND_ROWS|SQL_SMALL_RESULT|SSL|STARTING|STRAIGHT_JOIN|TABLE|TERMINATED|THEN|TINYBLOB|TINYINT|TINYTEXT|TO|TRAILING|TRIGGER|TRUE|UNDO|UNION|UNIQUE|UNLOCK|UNSIGNED|UPDATE|USAGE|USE|USING|UTC_DATE|UTC_TIME|UTC_TIMESTAMP|VALUES|VARBINARY|VARCHAR|VARCHARACTER|VARYING|WHEN|WHERE|WHILE|WITH|WRITE|XOR|YEAR_MONTH|ZEROFILL)\b/gi, css: 'keyword' },
				],
				python: [
					{ regex: this.regexLib.pythonComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'string' },
					{ regex: this.regexLib.singleQuotes, css: 'string' },
					{ regex: this.regexLib.singleLineComment, css: 'comments' },
					{ regex: this.regexLib.singleLinePerlComment, css: 'comments' },
					{ regex: this.regexLib.number, css: 'number' },
					{ regex: /\b(and|exec|not|assert|finally|or|break|for|pass|class|from|print|continue|global|raise|def|if|return|del|import|try|elif|in|while|else|is|with|except|lambda|yield)\b/gi, css: 'keyword' },
				],
				'html xml htm': [
					{ regex: this.regexLib.htmlComment, css: 'comments' },
					{ regex: this.regexLib.xmlComment, css: 'comments' },
					{ regex: this.regexLib.script },
					{ regex: /((<[a-zA-Z]+)|(<\/[a-zA-Z]+>))/g, css: 'keyword' },
					{ regex: /(<\/|\/>|<|>)/g, css: 'bracket' },
					{
						regex: function (data) {
							return data.replace(/<([^>]*?)>/gim, function () {
								var index = arguments[arguments.length - 2],
									value = arguments[0], arr, left = '', right = '';
								if (arguments.length > 3) {
									arr = arguments[0].split(arguments[1]);
									left = arr[0];
									right = arr[1];
									//更正偏移量
									index = index + left.length;
									value = arguments[1];
								}
								if (!value) return '';
								//attr 和 双引号
								value = value.replace(/(\s+[\w-]+)\s*=/g, function (a, b) { return that.setCss('attr', b) + '=' }).replace(/(\".*?\")/g, function (a, b) { return that.setCss('quotation', a) });
								value = left + value + right;
								return value;
							});
						}
					},
				],
				css: [
					{ regex: this.regexLib.multiLineComment, css: 'comments' },
					{ regex: this.regexLib.doubleQuotes, css: 'gray' },
					{ regex: this.regexLib.singleQuotes, css: 'gray' },
					{ regex: /(@\w+)/g, css: 'constants' },
					{ regex: /\}*(.+)\{/g, css: 'keyword' },
					{ regex: /[\{|;]*([\w|-]+)\:/g, css: 'constants' },
					{ regex: /:(((?!['"\!;:\{\}]).)+)/g, css: 'value' },
					{ regex: /(!important)/g, css: 'warning' },
				],
			};
			this.regexFn = function (code, arg, css) {
				var index = arg[arg.length - 2],
					value = arg[0], str, arr, left = '', right = '';
				if (arg.length > 3) {
					arr = arg[0].split(arg[1]);
					left = arr[0];
					right = arr[1];
					//更正偏移量
					index = index + left.length;
					value = arg[1];
				}
				str = code.substr(0, index);
				if (!value) return '';
				//判断正则的内容中是否包含标签
				if (value.split(that.LL).length > value.split(that.RR).length)
					return arg[0];
				//清除里面的所有正则过的标签 
				value = value.replace(that.tagRegx, '$1');
				//判断正则的内容是否在标签内
				if (str.split(that.LL).length == str.split(that.RR).length)
					value = left + that.setCss(css, value) + right;
				return value;
			};
			//正则处理
			this.regex = function (code, regex) {
				return code.replace(regex.regex, function () {
					return that.regexFn(code, arguments, regex.css);
				});
			};
			this.toLanguage = function (data, language) {
				data = data.replace(that.tagRegx, '$1');
				//选择逐行处理，防止出错
				var hasLanguage;
				for (let i in that.languages) {
					if (i.split(' ').includes(language)) {
						hasLanguage = 1;
						for (var k in that.languages[i]) {
							var cond = that.languages[i][k];
							if (typeof (cond.regex) == 'function') {
								data = cond.regex(data, cond.css);
								continue;
							}
							data = data.split('\n');
							for (let s = 0; s < data.length; s++)
								data[s] = that.regex(data[s], cond);
							data = data.join('\n')
						}
						break;
					}
				}
				if (!hasLanguage) this.toLanguage(data, 'common');
				return data;
			};
			if(callback){
				this.init(callback);
			}else{
				this.light();
			}
		}
		//代码展示
		light() {
			var pre = document.getElementsByTagName('pre');
			var template = document.getElementsByTagName('template');
			var list = [];
			for (let i = 0; i < pre.length; i++) {
				list.push(pre[i]);
			}
			for (let i = 0; i < template.length; i++) {
				list.push(template[i]);
			}

			for (let i = 0; i < list.length; i++) {
				var item = list[i];
				var obj = item;
				var height = item.getAttribute('data-height');
				height = height ? height : 'initial';
				var width = item.getAttribute('data-width');
				width = width ? width : '100%';
				var id = item.getAttribute('data-id');
				if (id) {
					var code = document.getElementById(id);
					if (code) {
						var language = item.getAttribute('data-language');
						language = language ? language : 'html';
						if (code.tagName == 'SCRIPT') {
							language = 'js';
						}
						//创建pre
						if (item.tagName == 'TEMPLATE') {
							obj = document.createElement('pre');
							obj.innerHTML = item.innerHTML;
							item.parentNode.insertBefore(obj, item);
						}
						this.init({ el: obj, code: code.innerHTML, language: language, height: height, width: width });
					}
				} else {
					if (item.className.length && (item.className.slice(0,8) == 'iceCode:' || item.className.slice(0,5) == 'code-')) {
						var language = [];
						//创建pre
						if (item.tagName == 'TEMPLATE') {
							obj = document.createElement('pre');
							obj.innerHTML = item.innerHTML;
							item.parentNode.insertBefore(obj, item);
						}
						if (item.className.indexOf(':') > -1) {
							var lang = item.className.split(':');
							if (lang[0] == 'iceCode') language = lang;
						} else if (item.className.indexOf('-') > -1) {
							var lang = item.className.split('-');
							if (lang[0] == 'code') language = lang;
						}
						language = language.length > 1 ? language[1] : 'common';
						this.init({ el: obj, language: language, height: height, width: width });
					}
				}
			}
		}
		//代码初始化
		init(options) {
			options = options != undefined ? options : false;
			this.options = options;
			if (!options.el) return false;
			var width = options.width || '100%';	 //宽度
			this.height = options.height || 'initial';//高度
			var code = options.code || false;	 //代码
			var language = options.language || 'common'; //高亮语言
			var el = options.el.length > 0 ? options.el[0] : options.el; //对象
			var html = code ? code.replace(/&/gi, '&amp;') : el.innerHTML;
			html = this.codeInit(html);
			html = this.text2html(html);
			html = this.highlight(html, language);
			el.innerHTML = '<div class="iceCode-title">Code ' + (language === 'common' ? '' : language) + '<span class="iceCode-info">Line:' + html.line + '</span><span class="iceCode-arrow"></span></div>' + html.html;
			var css = el.className.split(' ');
			if (!css.includes('iceCode')) {
				css.push('iceCode');
				el.className = css.join(' ');
			}
			el.style.width = width;
			el.style.display = 'block';
		}
		//代码格式化
		codeInit(html) {
			html = html.replace(/\t/g, '    ');
			var html = html.split('\n');
			if (html.length > 0) {
				var str = '';
				for (var i = 0; i < html.length; i++) {
					if (html[i].trim().length) {
						str = html[i];
						break;
					}
				}
				if (str.length) {
					var s = str.match(/^\s+/);
					if (s && s.length > 0) {
						s = s[0];
						for (var i = 0; i < html.length; i++) {
							if (html[i].length) {
								if (html[i].slice(0, s.length) === s) {
									html[i] = html[i].slice(s.length);
								}
							}
						}
					}
				}
			}
			return html.join('\n');
		}
		//html转字符串
		html2text(html) {
			return html.replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; });
		}
		//字符串转html
		text2html(str) {
			return str.replace(/&(lt|gt|nbsp|amp|quot);/ig, function (all, t) { return { 'lt': '<', 'gt': '>', 'nbsp': ' ', 'amp': '&', 'quot': '"' }[t]; });
		}
		//代码高亮
		highlight(data, language) {
			language = language.toLowerCase() || 'common';
			var that = this;
			data = data.trim();
			//根据内置编程语言格式化
			data = that.toLanguage(data, language);
			//转义
			data = that.html2text(data);
			//释放真正的html标签
			data = data.replace(new RegExp(that.LL, 'g'), '<code class="').replace(new RegExp(that.LR, 'g'), '">').replace(new RegExp(that.RR, 'g'), '</code>');
			var html = data.split('\n'), code = '';
			//删除最后一行的空行
			if (!html[html.length - 1].trim()) html.pop();
			//格式化html
			var li = '';
			for (var i = 0; i < html.length; i++) {
				li += '<li>' + (i + 1) + '.</li>';
				code += '<li>' + html[i] + '</li>';
			}
			return {
				line: html.length,
				html: '<div class="iceCode-main" style="max-height:' + this.height + ';"><ul class="iceCode-line">' + li + '</ul><ul class="iceCode-content iceCode-default iceCode-' + language + '">' + code + '</ul></div>'
			};
		}
	}
	return new iceCode();
};