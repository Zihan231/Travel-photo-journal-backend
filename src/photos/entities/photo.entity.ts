import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { User } from '../../users/entities/user.entity.js';

@Entity('photos')
export class Photo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 200 })
  location: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 500, name: 'image_url' })
  imageUrl: string;

  @Column({ type: 'varchar', length: 255, name: 'cloudinary_public_id' })
  cloudinaryPublicId: string;

  @Column({ type: 'text', nullable: true, name: 'ai_summary' })
  aiSummary: string | null;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne('User', 'photos', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
