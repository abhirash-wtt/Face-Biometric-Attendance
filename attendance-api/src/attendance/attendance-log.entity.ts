import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';

@Entity('attendance_logs')
export class AttendanceLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (e) => e.logs, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  employee?: Employee;

  @Column({ type: 'uuid', nullable: true })
  employee_id?: string;

  @Column({ type: 'text' })
  type: 'IN' | 'OUT';

  @Column({ type: 'timestamptz', default: () => 'now()' })
  event_time: Date;

  @Column({ type: 'text', nullable: true })
  device_id?: string;

  @Column({ type: 'text', nullable: true })
  site_code?: string;

  @Column({ type: 'double precision', nullable: true })
  gps_lat?: number;

  @Column({ type: 'double precision', nullable: true })
  gps_lng?: number;

  @Column({ type: 'real', nullable: true })
  similarity?: number;

  @Column({ type: 'real', nullable: true })
  liveness_score?: number;

  @Column({ type: 'text', nullable: true })
  face_crop_url?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
