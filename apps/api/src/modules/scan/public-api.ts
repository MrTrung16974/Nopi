// Thứ duy nhất mô-đun khác được import từ scan.
export { ScanModule } from './scan.module.js';
export { ScanService } from './application/scan.service.js';
export { SCAN_ENGINE, FakeScanEngine, ClaudeScanEngine, ScanError, type ScanEngine } from './ports/scan-engine.js';
