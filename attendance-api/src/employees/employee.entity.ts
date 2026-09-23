import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FaceTemplate } from '../templates/face-template.entity';
import { AttendanceLog } from '../attendance/attendance-log.entity';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  code: string;

  @Column({ type: 'text' })
  display_name: string;

  @Column({ type: 'text', default: 'active' })
  status: 'active' | 'inactive';

  /** On-site employees must pass geofence; remote may skip it. */
  @Column({ type: 'text', default: 'onsite' })
  working_mode: 'onsite' | 'remote';

  @Column({ type: 'uuid', nullable: true })
  reporting_manager_id?: string | null;

  @Column({ type: 'uuid', nullable: true })
  bu_owner_id?: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reporting_manager_id' })
  reporting_manager?: Employee | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bu_owner_id' })
  bu_owner?: Employee | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @OneToMany(() => FaceTemplate, (t) => t.employee)
  templates: FaceTemplate[];

  @OneToMany(() => AttendanceLog, (l) => l.employee)
  logs: AttendanceLog[];
}
