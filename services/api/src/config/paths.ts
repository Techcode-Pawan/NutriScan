import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (works from src/ under tsx and from dist/ after build). */
export const REPO_ROOT = path.resolve(here, '../../../..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const API_ROOT = path.resolve(here, '../..');
export const UPLOAD_DIR = path.join(API_ROOT, 'uploads');
