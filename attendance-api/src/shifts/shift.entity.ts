import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('shifts')
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ type: 'int', default: 5 })
  grace_minutes: number;
}
