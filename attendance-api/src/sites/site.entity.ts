import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Device } from '../devices/device.entity';

@Entity('sites')
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  code: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'double precision', nullable: true })
  lat?: number;

  @Column({ type: 'double precision', nullable: true })
  lng?: number;

  @Column({ type: 'int', default: 200 })
  radius_m: number;

  @Column({ type: 'jsonb', nullable: true })
  geofence_polygon?: Array<[number, number]> | null;

  @OneToMany(() => Device, (d) => d.site)
  devices: Device[];
}
