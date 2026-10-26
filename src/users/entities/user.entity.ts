import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  type Relation,
} from 'typeorm';
import type { Photo } from '../../photos/entities/photo.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_email_verified' })
  isEmailVerified: boolean;

  @Column({
    type: 'varchar',
    length: 10,
    nullable: true,
    select: false,
    name: 'verification_code',
  })
  verificationCode: string | null;

  @Column({
    type: 'datetime',
    nullable: true,
    select: false,
    name: 'code_expires_at',
  })
  codeExpiresAt: Date | null;

  @Column({
    type: 'int',
    default: 0,
    select: false,
    name: 'verification_attempts',
  })
  verificationAttempts: number;

  @Column({
    type: 'datetime',
    nullable: true,
    select: false,
    name: 'last_code_sent_at',
  })
  lastCodeSentAt: Date | null;

  @Column({ type: 'boolean', default: false, name: 'is_two_factor_enabled' })
  isTwoFactorEnabled: boolean;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    select: false,
    name: 'two_factor_secret',
  })
  twoFactorSecret: string | null;

  @Column({
    type: 'simple-json',
    nullable: true,
    select: false,
    name: 'two_factor_recovery_codes',
  })
  twoFactorRecoveryCodes: string[] | null;

  @Column({
    type: 'int',
    default: 0,
    select: false,
    name: 'two_factor_attempts',
  })
  twoFactorAttempts: number;

  @Column({
    type: 'datetime',
    nullable: true,
    select: false,
    name: 'two_factor_lockout_until',
  })
  twoFactorLockoutUntil: Date | null;

  @Column({
    type: 'bigint',
    nullable: true,
    select: false,
    name: 'two_factor_last_step',
  })
  twoFactorLastStep: number | null;

  @OneToMany('Photo', 'user')
  photos: Relation<Photo[]>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
