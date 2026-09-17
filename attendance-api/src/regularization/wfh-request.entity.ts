import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { User } from '../auth/user.entity';

export type WfhRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type RegularizationRequestType = 'wfh' | 'mark_present';

@Entity('wfh_regularization_requests')
export class WfhRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  employee_id: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee?: Employee;

  /** Calendar date (Asia/Kolkata) the request applies to, stored as YYYY-MM-DD. */
  @Column({ type: 'date' })
  work_date: string;

  /** `wfh` skips geofence on clock-in/out; `mark_present` marks the roster Present with blank punch times. */
  @Column({ type: 'text', default: 'wfh' })
  request_type: RegularizationRequestType;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', default: 'pending' })
  status: WfhRequestStatus;

  @Column({ type: 'uuid' })
  requested_by_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requested_by_user_id' })
  requested_by?: User;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by_user_id?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by_user_id' })
  reviewed_by?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewed_at?: Date | null;

  @Column({ type: 'text', nullable: true })
  review_note?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
