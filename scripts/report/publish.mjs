// 생성된 리포트를 암호화해 reports 브랜치 작업 폴더에 넣고 목록(index)을 갱신한다.
// node publish.mjs <out 폴더> <reports 작업 폴더>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sitePassword, encrypt, decryptNode, makeKey } from '../gate.mjs';

const [outDir, repDir] = process.argv.slice(2);
const pw = sitePassword(), K = makeKey(pw);
const meta = JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8'));
const id = `${meta.market}_${meta.code}_${meta.created.replace(/[-:T+]/g, '').slice(0, 12)}`;
mkdirSync(join(repDir, 'r'), { recursive: true });
writeFileSync(join(repDir, 'r', `${id}.md.enc.json`), JSON.stringify(encrypt(readFileSync(join(outDir, 'report.md')), pw, K)));
if (meta.pdf) writeFileSync(join(repDir, 'r', `${id}.pdf.enc.json`), JSON.stringify(encrypt(readFileSync(join(outDir, 'report.pdf')), pw, K)));
const idxPath = join(repDir, 'index.enc.json');
let list = [];
if (existsSync(idxPath)) { try { list = JSON.parse(decryptNode(JSON.parse(readFileSync(idxPath, 'utf8')), pw)); } catch (e) { console.warn('기존 목록을 열 수 없어 새로 만듭니다:', e.message); } }
list = [{ id, ...meta }, ...list.filter((x) => x.id !== id)];
writeFileSync(idxPath, JSON.stringify(encrypt(JSON.stringify(list), pw, K)));
console.log(`게시: ${id} (목록 ${list.length}건)`);
