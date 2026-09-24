"""Minimal reader for uncompressed .blend files (Blender 2.8 - 4.x, 64-bit, little endian).
Parses file blocks + SDNA so structs can be read by field name."""
import struct

class Struct:
    def __init__(self, name, fields, size):
        self.name, self.fields, self.size = name, fields, size  # fields: list of (type, name, offset, size, count, is_ptr)

class BlendFile:
    def __init__(self, path):
        self.data = open(path, 'rb').read()
        d = self.data
        assert d[:7] == b'BLENDER', 'not an uncompressed blend file'
        self.ptr = 8 if d[7:8] == b'-' else 4
        self.le = d[8:9] == b'v'
        self.version = d[9:12].decode()
        assert self.ptr == 8 and self.le
        self.blocks = []
        off = 12
        while off < len(d):
            code = d[off:off + 4].rstrip(b'\0').decode('latin1')
            size, = struct.unpack_from('<i', d, off + 4)
            old, = struct.unpack_from('<Q', d, off + 8)
            sdna, count = struct.unpack_from('<ii', d, off + 16)
            self.blocks.append({'code': code, 'size': size, 'old': old, 'sdna': sdna, 'count': count, 'off': off + 24})
            off += 24 + size
            if code == 'ENDB':
                break
        self.by_ptr = {b['old']: b for b in self.blocks}
        dna = next(b for b in self.blocks if b['code'] == 'DNA1')
        self.parse_sdna(dna['off'])

    def parse_sdna(self, off):
        d = self.data
        assert d[off:off + 4] == b'SDNA'
        start = off
        align = lambda o: start + ((o - start + 3) & ~3)
        off += 4
        def read_names(off, tag):
            assert d[off:off + 4] == tag, tag
            off += 4
            n, = struct.unpack_from('<i', d, off); off += 4
            out = []
            for _ in range(n):
                e = d.index(b'\0', off)
                out.append(d[off:e].decode('latin1')); off = e + 1
            return out, off
        names, off = read_names(off, b'NAME')
        off = align(off)
        types, off = read_names(off, b'TYPE')
        off = align(off)
        assert d[off:off + 4] == b'TLEN'; off += 4
        tlen = list(struct.unpack_from('<%dh' % len(types), d, off)); off += 2 * len(types)
        off = align(off)
        assert d[off:off + 4] == b'STRC'; off += 4
        n, = struct.unpack_from('<i', d, off); off += 4
        self.structs = []
        self.struct_by_name = {}
        for _ in range(n):
            ti, nf = struct.unpack_from('<hh', d, off); off += 4
            fields = []
            foff = 0
            for _ in range(nf):
                ft, fn = struct.unpack_from('<hh', d, off); off += 4
                name = names[fn]
                is_ptr = name.startswith('*') or name.startswith('(*')
                count = 1
                base = name
                if '[' in name:
                    dims = [int(x.split(']')[0]) for x in name.split('[')[1:]]
                    for x in dims: count *= x
                    base = name.split('[')[0]
                base = base.lstrip('*').replace('(', '').replace(')', '')
                if is_ptr:
                    fsize = self.ptr * count
                else:
                    fsize = tlen[ft] * count
                fields.append((types[ft], base, foff, fsize, count, is_ptr, name))
                foff += fsize
            s = Struct(types[ti], fields, tlen[ti])
            self.structs.append(s)
            self.struct_by_name[types[ti]] = s

    def fields(self, sname):
        return self.struct_by_name[sname].fields

    def get(self, sname, off, field):
        for (t, n, fo, fs, cnt, isp, raw) in self.struct_by_name[sname].fields:
            if n == field:
                a = off + fo
                if isp:
                    return struct.unpack_from('<Q', self.data, a)[0] if cnt == 1 else struct.unpack_from('<%dQ' % cnt, self.data, a)
                fmt = {'int': 'i', 'short': 'h', 'char': 'b', 'float': 'f', 'double': 'd', 'uchar': 'B', 'ushort': 'H', 'int64_t': 'q', 'uint64_t': 'Q', 'int8_t': 'b', 'uint8_t': 'B', 'int16_t': 'h', 'uint16_t': 'H', 'int32_t': 'i', 'uint32_t': 'I'}.get(t)
                if t == 'char' and cnt > 1:
                    raw_b = self.data[a:a + cnt]
                    return raw_b.split(b'\0')[0].decode('latin1')
                if fmt is None:
                    return a  # nested struct: return absolute offset
                if cnt == 1:
                    return struct.unpack_from('<' + fmt, self.data, a)[0]
                return struct.unpack_from('<%d%s' % (cnt, fmt), self.data, a)
        raise KeyError(f'{sname}.{field}')

    def block_at(self, ptr):
        return self.by_ptr.get(ptr)
