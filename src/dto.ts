import { Type, Transform } from 'class-transformer';
import { Equals, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { EstadoInforme, Rol } from './generated/prisma/client';

export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(1, 128) password!: string;
}
export class UserDto {
  @IsEmail() @MaxLength(254) email!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(2, 160) nombre!: string;
  @IsString() @Length(12, 128) password!: string;
  @IsEnum(Rol) rol!: Rol;
}
export class PacienteDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(2, 160) nombre!: string;
  @IsOptional() @IsString() @Length(3, 40) @Matches(/^[A-Z0-9 .-]+$/i) ci?: string;
  @IsOptional() @IsString() @Length(2, 40) @Matches(/^[A-Z0-9-]+$/i) pac?: string;
}
export class BuscarPacienteDto {
  @IsOptional() @IsString() @Length(3, 40) ci?: string;
  @IsOptional() @IsString() @Length(2, 40) pac?: string;
  /** Un solo campo para quien no sabe si el paciente es de CI o de PAC. */
  @IsOptional() @IsString() @Length(2, 40) @Matches(/^[A-Z0-9 .-]+$/i) identificador?: string;
}
export class CrearInformeDto {
  @IsUUID() pacienteId!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(3, 160) estudio!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaEstudio!: string;
}
export class RevisionDto {
  @Type(() => Number) @IsInt() @Min(1) revision!: number;
}
export class PublicarDto extends RevisionDto {
  @Equals(true, { message: 'Confirma la identidad del paciente y el PDF antes de publicar.' }) pacienteYPdfConfirmados!: true;
}
export class RetirarDto extends RevisionDto {
  @IsString() @Length(5, 250) motivo!: string;
}
export class ListarDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite = 25;
  @IsOptional() @IsEnum(EstadoInforme) estado?: EstadoInforme;
  @IsOptional() @IsUUID() pacienteId?: string;
  @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(2, 160) buscar?: string;
}
export class InformesCrmDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite = 50;
  /** Un solo informe: el CRM revalida contra el portal justo antes de enviar. */
  @IsOptional() @IsUUID() informeId?: string;
}
export class PasswordDto {
  @IsString() @Length(1, 128) actual!: string;
  @IsString() @Length(12, 128) nueva!: string;
}
