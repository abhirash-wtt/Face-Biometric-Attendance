import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ type: 'text', name: 'password_hash' })
  password_hash: string;

  @Column({ type: 'text', default: 'employee' })
  role: 'admin' | 'employee' | 'bu' | 'manager' | 'hr';

  @Column({ type: 'uuid', nullable: true })
  employee_id?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
