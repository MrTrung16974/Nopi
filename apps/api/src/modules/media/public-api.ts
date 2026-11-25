// Thứ duy nhất mô-đun khác được import từ media.
export { MediaModule } from './media.module.js';
export { MediaService, MediaUploaded, type MediaOwner } from './application/media.service.js';
export { MediaJobs } from './application/media-jobs.js';
export { ownerOf } from './application/media-owner.js';
export { OBJECT_STORAGE, type ObjectStorage } from './ports/object-storage.js';
export { MEDIA_PROCESSOR, FfmpegProcessor, type MediaProcessor } from './ports/media-processor.js';
