import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';

@Entity('face_templates')
export class FaceTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (e) => e.templates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ name: 'employee_id', type: 'uuid' })
  employee_id: string;

  @Column({ type: 'text' })
  embedding: string;

  @Column({ type: 'real', nullable: true })
  liveness_score?: number;

  @Column({ type: 'text', nullable: true })
  pose?: 'straight' | 'left' | 'right' | null;

  @Column({ type: 'real', nullable: true })
  features_coverage?: number;

  @Column({ type: 'boolean', default: false })
  features_complete: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
