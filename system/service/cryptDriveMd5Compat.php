<?php
/**
 * 与 kernel/drive/cryptDrive.js 中 CryptDrive._md5Hash / CryptDrive.md5 对齐：
 * 1) 输入字节：与 JS 中 unescape(encodeURIComponent(String(data))) 相同管线（ECMA encodeURIComponent 转义规则 + unescape 还原为字节序列）；
 * 2) MD5 压缩：与 _md5Hash 内 md5cycle / 填充 / 小端字块一致。
 * 不使用 PHP 内置 md5()。非法 UTF-8 在 PHP 端经 mb_scrub / mb_convert 规整后再编码，与 JSON 传入的合法 UTF-8 口令行为一致。
 */

if (!function_exists('zeros_cryptdrive_md5_hash')) {

    /**
     * encodeURIComponent 中不转义的 ASCII 单字节（ECMA-262）
     */
    function zeros_cryptdrive_uri_component_unreserved_byte($ord) {
        if ($ord >= 0x30 && $ord <= 0x39) {
            return true;
        }
        if ($ord >= 0x41 && $ord <= 0x5A) {
            return true;
        }
        if ($ord >= 0x61 && $ord <= 0x7A) {
            return true;
        }
        return $ord === 0x2D || $ord === 0x5F || $ord === 0x2E || $ord === 0x21
            || $ord === 0x7E || $ord === 0x2A || $ord === 0x27 || $ord === 0x28 || $ord === 0x29;
    }

    /**
     * 与 JS encodeURIComponent 一致：UTF-8 字节序列，仅 A-Za-z0-9-_.!~*'() 不转义，其余字节为 %XX（大写十六进制）
     */
    function zeros_cryptdrive_encode_uri_component($s) {
        $s = (string)$s;
        if (function_exists('mb_scrub')) {
            $s = mb_scrub($s, 'UTF-8');
        } elseif (function_exists('mb_convert_encoding')) {
            $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8');
        }
        // 无 mbstring 时按 UTF-8 八位组逐字节转义（与 encodeURIComponent 对 UTF-8 八位流规则一致）
        if (!function_exists('mb_strlen') || !function_exists('mb_substr')) {
            $bytesRaw = array_values(unpack('C*', $s));
            $out = '';
            foreach ($bytesRaw as $o) {
                if ($o <= 127 && zeros_cryptdrive_uri_component_unreserved_byte($o)) {
                    $out .= chr($o);
                } else {
                    $out .= sprintf('%%%02X', $o);
                }
            }
            return $out;
        }
        $out = '';
        $len = mb_strlen($s, 'UTF-8');
        for ($i = 0; $i < $len; $i++) {
            $ch = mb_substr($s, $i, 1, 'UTF-8');
            $blen = strlen($ch);
            if ($blen === 1) {
                $o = ord($ch[0]);
                if ($o <= 127 && zeros_cryptdrive_uri_component_unreserved_byte($o)) {
                    $out .= $ch;
                    continue;
                }
            }
            for ($j = 0; $j < $blen; $j++) {
                $out .= sprintf('%%%02X', ord($ch[$j]));
            }
        }
        return $out;
    }

    /**
     * 与 JS unescape(encodeURIComponent(...)) 对 %XX 序列的还原一致：字面 ASCII 按单字节，%HH 为十六进制字节
     */
    function zeros_cryptdrive_unescape_uri_bytes($escaped) {
        $bytes = [];
        $n = strlen($escaped);
        $i = 0;
        while ($i < $n) {
            if ($escaped[$i] === '%' && $i + 2 < $n
                && ctype_xdigit($escaped[$i + 1]) && ctype_xdigit($escaped[$i + 2])) {
                $bytes[] = (int)hexdec(substr($escaped, $i + 1, 2));
                $i += 3;
                continue;
            }
            $bytes[] = ord($escaped[$i]);
            $i++;
        }
        return $bytes;
    }

    /**
     * 与 CryptDrive._md5Hash 首段「UTF-8 字节数组」一致
     */
    function zeros_cryptdrive_md5_input_bytes_like_js($password) {
        return zeros_cryptdrive_unescape_uri_bytes(zeros_cryptdrive_encode_uri_component($password));
    }

    function zeros_cryptdrive_md5_hash($password) {
        $bytes = zeros_cryptdrive_md5_input_bytes_like_js($password);

        $originalLen = count($bytes);
        $bytes[] = 0x80;
        while (count($bytes) % 64 !== 56) {
            $bytes[] = 0;
        }

        $bitLen = $originalLen * 8;
        for ($i = 0; $i < 8; $i++) {
            $bytes[] = ($bitLen >> ($i * 8)) & 0xFF;
        }

        $h = [1732584193, -271733879, -1732584194, 271733878];

        $bytesLen = count($bytes);
        for ($i = 0; $i < $bytesLen; $i += 64) {
            $chunk = [];
            for ($j = 0; $j < 16; $j++) {
                $idx = $i + $j * 4;
                $chunk[$j] = $bytes[$idx] |
                    ($bytes[$idx + 1] << 8) |
                    ($bytes[$idx + 2] << 16) |
                    ($bytes[$idx + 3] << 24);
            }
            zeros_cryptdrive_md5cycle($h, $chunk);
        }

        return zeros_cryptdrive_md5_state_hex($h);
    }

    function zeros_cryptdrive_md5cycle(&$x, $k) {
        $a = $x[0];
        $b = $x[1];
        $c = $x[2];
        $d = $x[3];

        $a = zeros_cryptdrive_ff($a, $b, $c, $d, $k[0], 7, -680876936);
        $d = zeros_cryptdrive_ff($d, $a, $b, $c, $k[1], 12, -389564586);
        $c = zeros_cryptdrive_ff($c, $d, $a, $b, $k[2], 17, 606105819);
        $b = zeros_cryptdrive_ff($b, $c, $d, $a, $k[3], 22, -1044525330);
        $a = zeros_cryptdrive_ff($a, $b, $c, $d, $k[4], 7, -176418897);
        $d = zeros_cryptdrive_ff($d, $a, $b, $c, $k[5], 12, 1200080426);
        $c = zeros_cryptdrive_ff($c, $d, $a, $b, $k[6], 17, -1473231341);
        $b = zeros_cryptdrive_ff($b, $c, $d, $a, $k[7], 22, -45705983);
        $a = zeros_cryptdrive_ff($a, $b, $c, $d, $k[8], 7, 1770035416);
        $d = zeros_cryptdrive_ff($d, $a, $b, $c, $k[9], 12, -1958414417);
        $c = zeros_cryptdrive_ff($c, $d, $a, $b, $k[10], 17, -42063);
        $b = zeros_cryptdrive_ff($b, $c, $d, $a, $k[11], 22, -1990404162);
        $a = zeros_cryptdrive_ff($a, $b, $c, $d, $k[12], 7, 1804603682);
        $d = zeros_cryptdrive_ff($d, $a, $b, $c, $k[13], 12, -40341101);
        $c = zeros_cryptdrive_ff($c, $d, $a, $b, $k[14], 17, -1502002290);
        $b = zeros_cryptdrive_ff($b, $c, $d, $a, $k[15], 22, 1236535329);

        $a = zeros_cryptdrive_gg($a, $b, $c, $d, $k[1], 5, -165796510);
        $d = zeros_cryptdrive_gg($d, $a, $b, $c, $k[6], 9, -1069501632);
        $c = zeros_cryptdrive_gg($c, $d, $a, $b, $k[11], 14, 643717713);
        $b = zeros_cryptdrive_gg($b, $c, $d, $a, $k[0], 20, -373897302);
        $a = zeros_cryptdrive_gg($a, $b, $c, $d, $k[5], 5, -701558691);
        $d = zeros_cryptdrive_gg($d, $a, $b, $c, $k[10], 9, 38016083);
        $c = zeros_cryptdrive_gg($c, $d, $a, $b, $k[15], 14, -660478335);
        $b = zeros_cryptdrive_gg($b, $c, $d, $a, $k[4], 20, -405537848);
        $a = zeros_cryptdrive_gg($a, $b, $c, $d, $k[9], 5, 568446438);
        $d = zeros_cryptdrive_gg($d, $a, $b, $c, $k[14], 9, -1019803690);
        $c = zeros_cryptdrive_gg($c, $d, $a, $b, $k[3], 14, -187363961);
        $b = zeros_cryptdrive_gg($b, $c, $d, $a, $k[8], 20, 1163531501);
        $a = zeros_cryptdrive_gg($a, $b, $c, $d, $k[13], 5, -1444681467);
        $d = zeros_cryptdrive_gg($d, $a, $b, $c, $k[2], 9, -51403784);
        $c = zeros_cryptdrive_gg($c, $d, $a, $b, $k[7], 14, 1735328473);
        $b = zeros_cryptdrive_gg($b, $c, $d, $a, $k[12], 20, -1926607734);

        $a = zeros_cryptdrive_hh($a, $b, $c, $d, $k[5], 4, -378558);
        $d = zeros_cryptdrive_hh($d, $a, $b, $c, $k[8], 11, -2022574463);
        $c = zeros_cryptdrive_hh($c, $d, $a, $b, $k[11], 16, 1839030562);
        $b = zeros_cryptdrive_hh($b, $c, $d, $a, $k[14], 23, -35309556);
        $a = zeros_cryptdrive_hh($a, $b, $c, $d, $k[1], 4, -1530992060);
        $d = zeros_cryptdrive_hh($d, $a, $b, $c, $k[4], 11, 1272893353);
        $c = zeros_cryptdrive_hh($c, $d, $a, $b, $k[7], 16, -155497632);
        $b = zeros_cryptdrive_hh($b, $c, $d, $a, $k[10], 23, -1094730640);
        $a = zeros_cryptdrive_hh($a, $b, $c, $d, $k[13], 4, 681279174);
        $d = zeros_cryptdrive_hh($d, $a, $b, $c, $k[0], 11, -358537222);
        $c = zeros_cryptdrive_hh($c, $d, $a, $b, $k[3], 16, -722521979);
        $b = zeros_cryptdrive_hh($b, $c, $d, $a, $k[6], 23, 76029189);
        $a = zeros_cryptdrive_hh($a, $b, $c, $d, $k[9], 4, -640364487);
        $d = zeros_cryptdrive_hh($d, $a, $b, $c, $k[12], 11, -421815835);
        $c = zeros_cryptdrive_hh($c, $d, $a, $b, $k[15], 16, 530742520);
        $b = zeros_cryptdrive_hh($b, $c, $d, $a, $k[2], 23, -995338651);

        $a = zeros_cryptdrive_ii($a, $b, $c, $d, $k[0], 6, -198630844);
        $d = zeros_cryptdrive_ii($d, $a, $b, $c, $k[7], 10, 1126891415);
        $c = zeros_cryptdrive_ii($c, $d, $a, $b, $k[14], 15, -1416354905);
        $b = zeros_cryptdrive_ii($b, $c, $d, $a, $k[5], 21, -57434055);
        $a = zeros_cryptdrive_ii($a, $b, $c, $d, $k[12], 6, 1700485571);
        $d = zeros_cryptdrive_ii($d, $a, $b, $c, $k[3], 10, -1894986606);
        $c = zeros_cryptdrive_ii($c, $d, $a, $b, $k[10], 15, -1051523);
        $b = zeros_cryptdrive_ii($b, $c, $d, $a, $k[1], 21, -2054922799);
        $a = zeros_cryptdrive_ii($a, $b, $c, $d, $k[8], 6, 1873313359);
        $d = zeros_cryptdrive_ii($d, $a, $b, $c, $k[15], 10, -30611744);
        $c = zeros_cryptdrive_ii($c, $d, $a, $b, $k[6], 15, -1560198380);
        $b = zeros_cryptdrive_ii($b, $c, $d, $a, $k[13], 21, 1309151649);
        $a = zeros_cryptdrive_ii($a, $b, $c, $d, $k[4], 6, -145523070);
        $d = zeros_cryptdrive_ii($d, $a, $b, $c, $k[11], 10, -1120210379);
        $c = zeros_cryptdrive_ii($c, $d, $a, $b, $k[2], 15, 718787259);
        $b = zeros_cryptdrive_ii($b, $c, $d, $a, $k[9], 21, -343485551);

        $x[0] = zeros_cryptdrive_add32($a, $x[0]);
        $x[1] = zeros_cryptdrive_add32($b, $x[1]);
        $x[2] = zeros_cryptdrive_add32($c, $x[2]);
        $x[3] = zeros_cryptdrive_add32($d, $x[3]);
    }

    function zeros_cryptdrive_cmn($q, $a, $b, $x, $s, $t) {
        $a = zeros_cryptdrive_add32(zeros_cryptdrive_add32($a, $q), zeros_cryptdrive_add32($x, $t));
        return zeros_cryptdrive_add32((($a << $s) | (($a & 0xFFFFFFFF) >> (32 - $s))) & 0xFFFFFFFF, $b);
    }

    function zeros_cryptdrive_ff($a, $b, $c, $d, $x, $s, $t) {
        return zeros_cryptdrive_cmn((($b & $c) | ((~$b) & $d)) & 0xFFFFFFFF, $a, $b, $x, $s, $t);
    }

    function zeros_cryptdrive_gg($a, $b, $c, $d, $x, $s, $t) {
        return zeros_cryptdrive_cmn((($b & $d) | ($c & (~$d))) & 0xFFFFFFFF, $a, $b, $x, $s, $t);
    }

    function zeros_cryptdrive_hh($a, $b, $c, $d, $x, $s, $t) {
        return zeros_cryptdrive_cmn((($b ^ $c) ^ $d) & 0xFFFFFFFF, $a, $b, $x, $s, $t);
    }

    function zeros_cryptdrive_ii($a, $b, $c, $d, $x, $s, $t) {
        return zeros_cryptdrive_cmn(($c ^ ($b | (~$d))) & 0xFFFFFFFF, $a, $b, $x, $s, $t);
    }

    function zeros_cryptdrive_add32($a, $b) {
        return ($a + $b) & 0xFFFFFFFF;
    }

    function zeros_cryptdrive_rhex($n) {
        $s = '';
        $hexChr = '0123456789abcdef';
        $n = $n & 0xFFFFFFFF;
        for ($i = 0; $i < 4; $i++) {
            $s .= $hexChr[(($n >> ($i * 8 + 4)) & 0x0F)] . $hexChr[(($n >> ($i * 8)) & 0x0F)];
        }
        return $s;
    }

    function zeros_cryptdrive_md5_state_hex($x) {
        $result = '';
        for ($i = 0; $i < count($x); $i++) {
            $result .= zeros_cryptdrive_rhex($x[$i]);
        }
        return $result;
    }
}
