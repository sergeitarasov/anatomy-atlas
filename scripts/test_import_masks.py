"""Check the RLE wire format and the supplied export's region identity/alignment."""
import json, unittest
from pathlib import Path
from PIL import Image
from import_masks import decode

class MaskImportTests(unittest.TestCase):
    def test_literal_and_repeated_runs(self):
        # Header: 8 values, 8-bit words, run widths 3, 4, 8, 16.
        bits=f'{8:032b}'+f'{7:05b}'+''.join(f'{n-1:04b}' for n in [3,4,8,16])
        bits+='0'+'00'+f'{3:03b}'+''.join(f'{v:08b}' for v in [0,1,2,255])
        bits+='1'+'00'+f'{3:03b}'+f'{127:08b}'
        bits+='0'*((-len(bits))%8)
        encoded=[int(bits[i:i+8],2) for i in range(0,len(bits),8)]
        self.assertEqual(decode(encoded,8),bytes([0,1,2,255,127,127,127,127]))
        with self.assertRaises(ValueError):decode(encoded[:-1],8)
        with self.assertRaises(ValueError):decode(encoded,7)
        with self.assertRaises(ValueError):decode([256],8)

    def test_supplied_bundle(self):
        root=Path(__file__).resolve().parents[1]/'src/main/resources/web/atlas'
        data=json.loads((root/'manifest.json').read_text());image=data['images'][0]
        self.assertEqual(image['selectedAnnotationId'],10)
        self.assertEqual(data['unknownTerms'],[])
        self.assertEqual([(a['id'],len(a['masks'])) for a in image['annotations']],[(9,1),(10,6)])
        masks=image['annotations'][1]['masks']
        self.assertEqual(len({m['id'] for m in masks}),6)
        self.assertEqual(len({m['term']['iri'] for m in masks}),5)
        for ann in image['annotations']:
            for m in ann['masks']:
                png=Image.open(root/m['file'])
                self.assertEqual(png.size,(image['width'],image['height']))
                self.assertEqual(list(png.getbbox()),m['bbox'])
                self.assertEqual(sum(v>0 for v in png.tobytes()),m['pixels'])
                self.assertEqual(set(png.tobytes()),{0,255})

if __name__=='__main__':unittest.main()
