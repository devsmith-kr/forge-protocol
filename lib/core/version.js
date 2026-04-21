/**
 * lib/core/version.js
 * package.json을 단일 소스로 사용하는 버전 모듈.
 * 다른 모든 곳에서는 이 파일을 통해서만 버전을 참조한다.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgPath = join(__dirname, '..', '..', 'package.json');

const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));

export const VERSION = pkg.version;
export const NAME = pkg.name;
export const DESCRIPTION = pkg.description;
