// Thứ duy nhất mô-đun khác được import từ assignments.
export { AssignmentsModule } from './assignments.module.js';
export { AssignmentsService } from './application/assignments.service.js';
export { StudentWorkService, type StudentAssignmentRow, type AssignmentRow } from './application/student-work.service.js';
export { AssignmentPublished } from './application/events.js';
