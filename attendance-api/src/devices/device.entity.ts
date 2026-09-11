import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Site } from '../sites/site.entity';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  device_id: string;

  @ManyToOne(() => Site, (s) => s.devices, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'site_id' })
  site?: Site | null;

  @Column({ type: 'uuid', nullable: true })
  site_id?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
