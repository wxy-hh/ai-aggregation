"""Exercise media CLI contracts offline; live providers are checked separately.

API responses are fixtures, downloads use a real local HTTP server. No provider
credentials or network availability are needed for regression tests.
"""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
import zlib
import struct

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/curate-media.mjs'
NODE = shutil.which('node')
FFMPEG = shutil.which('ffmpeg')
FFPROBE = shutil.which('ffprobe')


def png():
    def chunk(name, data):
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 8, 6, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\0' + bytes([200, 90, 30]) * 8) * 6)) + chunk(b'IEND', b'')


@unittest.skipUnless(NODE, 'Node is required')
class CurateMediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.image = png()
        cls.video_temp = tempfile.TemporaryDirectory(prefix='oil-curate-video-')
        cls.video = None
        if FFMPEG and FFPROBE:
            video = Path(cls.video_temp.name) / 'sample.mp4'
            subprocess.run([FFMPEG, '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x48:d=0.4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(video)], check=True, capture_output=True, timeout=20)
            cls.video = video.read_bytes()
        cls.requests = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                cls.requests.append(self.path)
                if self.path.startswith('/video') and cls.video:
                    data, mime = cls.video, 'video/mp4'
                elif self.path.startswith('/bad'):
                    data, mime = b'<html>upstream error</html>', 'text/html'
                elif self.path.startswith('/corrupt'):
                    data, mime = cls.image[:24], 'image/png'
                elif self.path.startswith('/large'):
                    data, mime = cls.image + b'x' * (2 * 1024 * 1024), 'image/png'
                else:
                    data, mime = cls.image, 'image/png'
                self.send_response(200)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', len(data))
                self.end_headers()
                try:
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass
            def log_message(self, *_):
                pass
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.video_temp.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='oil-curate-test-')
        self.addCleanup(self.temp.cleanup)
        self.cwd = Path(self.temp.name)
        self.shim = self.cwd / 'fixture.mjs'
        file = {'url': self.base + '/image', 'size': len(self.image), 'md5': hashlib.md5(self.image).hexdigest()}
        self.fixtures = {
            '/assets?t=textures': {'wood': {'name': 'Wood', 'categories': ['wood'], 'authors': {'Artist': 'All'}}},
            '/assets?t=models': {'wood-model': {'name': 'Wood model', 'tags': ['wood']}},
            '/files/wood': {k: {'1k': {'jpg': file}} for k in ('Diffuse', 'Rough', 'nor_gl')},
            '/files/wood-model': {'gltf': {'1k': {'gltf': {'url': self.base + '/model.gltf', 'include': {'model.bin': {'url': self.base + '/model.bin'}}}}}},
            '/v2/objects/search': {'records': [{'systemNumber': 'O1', '_primaryTitle': 'Wood furniture', '_images': {'_iiif_image_base_url': self.base + '/iiif'}}]},
            '/iiif/info.json': {'width': 8, 'height': 6},
            '/catalogue/v2/images': {'results': [{'id': 'im1', 'source': {'id': 'work1', 'title': 'Wood plate'}, 'locations': [{'url': self.base + '/iiif/info.json', 'locationType': {'id': 'iiif-image'}, 'credit': 'Creator / Wellcome', 'license': {'label': 'CC BY 4.0', 'url': 'https://creativecommons.org/licenses/by/4.0/'}}]}]},
            '/photos/': {'results': [{'id': 'http://www.loc.gov/item/1/', 'title': 'Wood photograph', 'image_url': [self.base + '/a.jpg'], 'item': {'rights_advisory': 'Item-specific rights'}}]},
            '/maps/': {'results': [{'id': 'http://www.loc.gov/item/2/', 'title': 'Wood map', 'image_url': [self.base + '/a.jpg']}]},
            '/collections/historic-american-buildings-landscapes-and-engineering-records/': {'results': [
                {'id': 'http://www.loc.gov/item/photo-only/', 'title': 'Not a drawing', 'image_url': [self.base + '/photo.jpg']},
                {'id': 'http://www.loc.gov/item/3/', 'title': 'Wood bridge', 'resources': [{'url': 'https://www.loc.gov/resource/hhh.3.sheet', 'image': self.base + '/sheet/00001_150px.jpg'}]}
            ]},
            '/search': {'collection': {'items': [{'href': self.base + '/manifest', 'data': [{'nasa_id': 'earth', 'title': 'Wood in orbit', 'media_type': 'image', 'center': 'NASA', 'photographer': 'Photographer'}], 'links': [{'href': self.base + '/thumb', 'render': 'image', 'rel': 'preview'}]}]}},
            '/manifest': [self.base + '/media~orig.jpg'],
        }
        self.write_shim()

    def write_shim(self, failures=()):
        self.shim.write_text('''const realFetch = globalThis.fetch;
const fixtures = ''' + json.dumps(self.fixtures) + ''';
const failures = ''' + json.dumps(list(failures)) + ''';
globalThis.fetch = async (input, init) => {
  const u = new URL(input); const key = u.pathname === '/assets' ? u.pathname + u.search : u.pathname;
  if (failures.includes(key)) return new Response('failure', {status:503});
  if (key in fixtures) return new Response(JSON.stringify(fixtures[key]), {headers:{'Content-Type':'application/json'}});
  if (u.hostname === '127.0.0.1') { u.protocol = 'http:'; return realFetch(u, init); }
  throw new Error('Unexpected fixture request: ' + u.href);
};
''', encoding='utf-8')

    def run_cli(self, *args, fixture=False, ok=True):
        cmd = [NODE]
        if fixture:
            cmd += ['--import', str(self.shim)]
        result = subprocess.run(cmd + [str(SCRIPT), *args], cwd=self.cwd, capture_output=True, text=True, timeout=40, encoding='utf-8')
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        else:
            self.assertNotEqual(result.returncode, 0, result.stderr + result.stdout)
        return result

    def test_help_and_actionable_argument_errors(self):
        self.assertIn('blueprint|map|plate|science|video', self.run_cli('--help').stdout)
        for args in [('search', 'wood', '--kind', 'unknown'), ('search', 'wood', '--limit', 'NaN'), ('search', 'wood', '--limt', '2'), ('fetch', 'V1', '--out', 'a.png', '--dir', 'assets'), ('search', 'wood', '--sheet=false'), ('unknown',), ('search', 'wood', '--resolution', '16k'), ('fetch', 'T1', '--maps', 'diffuse,all')]:
            with self.subTest(args=args):
                self.assertIn('node scripts/curate-media.mjs', self.run_cli(*args, ok=False).stderr)
        self.assertFalse((self.cwd / '.curate-cache.json').exists())

    def test_all_kinds_and_no_false_blueprints(self):
        for kind in ['texture', 'design', 'photo', 'blueprint', 'map', 'plate', 'science', 'video', 'all']:
            with self.subTest(kind=kind):
                result = json.loads(self.run_cli('search', 'wood', '--kind', kind, '--limit', '9', fixture=True).stdout)
                self.assertTrue(result['items'])
                self.assertEqual(result['errors'], [])
                if kind == 'all':
                    self.assertEqual({i['provider'] for i in result['items']}, {'polyhaven', 'vam', 'loc', 'wellcome', 'nasa'})
                if kind == 'blueprint':
                    self.assertTrue(all('/sheet/' in i['imageUrl'] for i in result['items']))
                    self.assertTrue(all('_150px' not in i['previewUrl'] for i in result['items']))

    def test_refs_survive_other_searches_and_texture_is_downloadable(self):
        a = json.loads(self.run_cli('search', 'wood', '--kind', 'texture', fixture=True).stdout)['items'][0]
        self.assertEqual(a['ref'], 'T1')
        self.assertEqual(a['imageUrl'], self.base + '/image')
        self.assertNotEqual(a['imageUrl'], a['previewUrl'])
        self.assertEqual(set(a['textureMaps']), {'diffuse', 'roughness', 'normal'})
        self.run_cli('search', 'wood', '--kind', 'design', fixture=True)
        b = json.loads(self.run_cli('search', 'wood', '--kind', 'texture', fixture=True).stdout)['items'][0]
        self.assertEqual(a['ref'], b['ref'])
        self.assertIn('V1', json.loads((self.cwd / '.curate-cache.json').read_text())['items'])

    @unittest.skipUnless(FFMPEG and FFPROBE, 'ffmpeg/ffprobe required for full decode')
    def test_batch_fetch_maps_integrity_sheet_credits_and_no_overwrite(self):
        self.run_cli('search', 'wood', '--kind', 'texture', fixture=True)
        self.run_cli('search', 'wood', '--kind', 'design', fixture=True)
        result = json.loads(self.run_cli('fetch', 'V1,T1', '--maps', 'all', '--dir', 'assets', '--sheet', fixture=True).stdout)
        self.assertEqual(result['count'], 4)
        self.assertTrue(all((i['width'], i['height'], i['integrity']) == (8, 6, 'full-decode') for i in result['files']))
        self.assertEqual(result['files'][0]['originalWidth'], 8)
        self.assertTrue((self.cwd / 'assets/sheet.html').exists())
        log = (self.cwd / 'assets/SOURCES.md').read_text()
        self.assertIn('License:', log)
        self.assertIn('Powered by Poly Haven', log)
        self.assertIn('Victoria and Albert Museum', log)
        repeated = json.loads(self.run_cli('fetch', 'T1', '--dir', 'assets', fixture=True).stdout)
        self.assertTrue(repeated['files'][0]['saved'].endswith('-1.png'))
        self.assertFalse(list((self.cwd / 'assets').glob('*.part')))
        self.assertFalse(list(self.cwd.glob('*.lock')))

    def test_direct_url_partial_failure_and_limit(self):
        result = json.loads(self.run_cli('fetch', self.base + '/image', self.base + '/bad', '--dir', 'assets', ok=False).stdout)
        self.assertEqual(result['count'], 1)
        self.assertEqual(len(result['errors']), 1)
        self.assertIn('Rights not verified', (self.cwd / 'assets/SOURCES.md').read_text())
        result = json.loads(self.run_cli('fetch', self.base + '/large', '--max-mb', '1', ok=False).stdout)
        self.assertEqual(result['count'], 0)
        self.assertIn('max-mb', result['errors'][0]['message'])

    def test_explicit_file_and_missing_ref(self):
        self.run_cli('fetch', self.base + '/image', '--out', 'assets/sample.png')
        r = json.loads(self.run_cli('fetch', self.base + '/image', '--out', 'assets/sample.png', ok=False).stdout)
        self.assertIn('已存在', r['errors'][0]['message'])
        self.assertEqual((self.cwd / 'assets/sample.png').read_bytes(), self.image)
        self.run_cli('fetch', 'V999', ok=False)
        self.run_cli('fetch', 'file:///etc/passwd', ok=False)

    @unittest.skipUnless(FFMPEG and FFPROBE, 'ffmpeg/ffprobe required for corruption check')
    def test_corrupt_image_and_md5_rejected_before_delivery(self):
        result = json.loads(self.run_cli('fetch', self.base + '/corrupt', '--sheet', ok=False).stdout)
        self.assertEqual(result['count'], 0)
        self.fixtures['/files/wood']['Diffuse']['1k']['jpg'] = {'url': self.base + '/image', 'size': len(self.image), 'md5': '0' * 32}
        self.write_shim()
        self.run_cli('search', 'wood', '--kind', 'texture', fixture=True)
        result = json.loads(self.run_cli('fetch', 'T1', fixture=True, ok=False).stdout)
        self.assertIn('MD5', result['errors'][0]['message'])
        self.assertFalse(list((self.cwd / 'assets').glob('T1*')))

    def test_source_failure_distinct_from_zero_matches(self):
        self.write_shim(failures=['/v2/objects/search'])
        result = json.loads(self.run_cli('search', 'wood', '--kind', 'all', fixture=True).stdout)
        self.assertEqual(result['errors'][0]['source'], 'vam')
        self.write_shim(failures=['/catalogue/v2/images'])
        self.run_cli('search', 'wood', '--kind', 'plate', fixture=True, ok=False)
        self.fixtures['/catalogue/v2/images'] = {'results': []}
        self.write_shim()
        result = json.loads(self.run_cli('search', 'wood', '--kind', 'plate', fixture=True).stdout)
        self.assertEqual(result['count'], 0)
        self.assertEqual(result['errors'], [])

    def test_preview_escapes_text_and_reports_dimensions(self):
        self.fixtures['/v2/objects/search']['records'][0]['_primaryTitle'] = '<script>boom</script>'
        self.write_shim()
        self.run_cli('search', 'wood', '--kind', 'design', fixture=True)
        self.run_cli('preview', 'V1', '--sheet', '--dir', 'previews')
        html = (self.cwd / 'previews/candidates.html').read_text()
        self.assertIn('&lt;script&gt;boom&lt;/script&gt;', html)
        self.assertIn('naturalWidth', html)
        self.assertIn('加载失败', html)

    @unittest.skipUnless(FFMPEG and FFPROBE, 'ffmpeg/ffprobe required for poster')
    def test_video_download_and_first_frame_poster(self):
        self.fixtures['/search']['collection']['items'][0]['data'][0]['media_type'] = 'video'
        self.fixtures['/manifest'] = [self.base + '/video~medium.mp4', self.base + '/video~orig.mov']
        self.write_shim()
        self.run_cli('search', 'earth', '--kind', 'video', fixture=True)
        result = json.loads(self.run_cli('fetch', 'N1', '--sheet', fixture=True).stdout)
        record = result['files'][0]
        self.assertTrue(record['poster'].endswith('-poster.jpg'))
        self.assertTrue(Path(record['poster']).is_file())
        self.assertEqual((record['width'], record['height']), (64, 48))
        self.assertEqual(record['integrity'], 'full-decode')
        self.assertIn('first-frame poster', (self.cwd / 'assets/SOURCES.md').read_text())

    @unittest.skipUnless(FFMPEG and FFPROBE, 'ffmpeg/ffprobe required for recovered video')
    def test_failed_video_rendition_falls_back_without_losing_reason(self):
        self.fixtures['/search']['collection']['items'][0]['data'][0]['media_type'] = 'video'
        self.fixtures['/manifest'] = [self.base + '/bad~medium.mp4', self.base + '/video~preview.mp4']
        self.write_shim()
        self.run_cli('search', 'earth', '--kind', 'video', fixture=True)
        data = json.loads(self.run_cli('fetch', 'N1', '--sheet', fixture=True).stdout)
        self.assertEqual(data['errors'], [])
        self.assertTrue(data['files'][0]['url'].endswith('~preview.mp4'))
        self.assertTrue(data['files'][0]['warnings'])
        self.assertTrue(Path(data['files'][0]['poster']).exists())

    def test_missing_tools_keep_download_and_report_unfinished_sheet(self):
        result = subprocess.run([NODE, str(SCRIPT), 'fetch', self.base + '/image', '--sheet'], cwd=self.cwd, env={**os.environ, 'PATH': ''}, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 1)
        data = json.loads(result.stdout)
        self.assertEqual(data['count'], 1)
        self.assertTrue(Path(data['files'][0]['saved']).exists())
        self.assertEqual(data['files'][0]['integrity'], 'signature-and-length-only')
        self.assertIn('ffprobe', data['errors'][0]['message'])

    def test_concurrent_searches_merge_cache_without_reassigning_refs(self):
        children = [subprocess.Popen([NODE, '--import', str(self.shim), str(SCRIPT), 'search', 'wood', '--kind', kind], cwd=self.cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for kind in ('texture', 'design', 'map', 'plate')]
        for child in children:
            out, err = child.communicate(timeout=30)
            self.assertEqual(child.returncode, 0, out + err)
        items = json.loads((self.cwd / '.curate-cache.json').read_text())['items']
        self.assertEqual(set(items), {'T1', 'T2', 'V1', 'L1', 'W1'})
        ids = [(i['provider'], i['sourceId']) for i in items.values()]
        self.assertEqual(len(ids), len(set(ids)))

    def test_map_selection_video_renditions_and_animation_filter(self):
        javascript = """import assert from 'node:assert/strict';
import {selectMap, selectNasaFile, interleave} from %s;
assert.equal(selectMap({nor_gl:{'2k':{jpg:{url:'gl'}}},nor_dx:{'1k':{jpg:{url:'dx'}}}},['nor_gl'],'1k').url,'gl');
assert.equal(selectMap({Diffuse:{'1k':{jpg:{url:'small'}},'8k':{jpg:{url:'large'}}}},['Diffuse'],'4k').url,'small');
assert.equal(selectNasaFile(['a~orig.mov','a~preview.mp4','a~medium.mp4'],'video'),'a~medium.mp4');
assert.equal(selectNasaFile(['a~thumb.jpg','a~orig.jpg'],'image'),'a~orig.jpg');
assert.equal(interleave([[{provider:'a',sourceId:'1'},{provider:'a',sourceId:'2'}],[{provider:'b',sourceId:'3'}]],2)[1].provider,'b');
""" % json.dumps(SCRIPT.as_uri())
        subprocess.run([NODE, '--input-type=module', '-e', javascript], check=True, capture_output=True, timeout=10)
        nasa = self.fixtures['/search']['collection']['items']
        nasa.insert(0, {'data': [{'nasa_id': 'animation', 'title': 'Launch Animation', 'media_type': 'video'}], 'links': [{'href': self.base + '/thumb', 'render': 'image'}]})
        self.write_shim()
        result = json.loads(self.run_cli('search', 'wood', '--kind', 'video', fixture=True).stdout)
        self.assertEqual([r['sourceId'] for r in result['items']], ['earth'])


if __name__ == '__main__':
    unittest.main()
