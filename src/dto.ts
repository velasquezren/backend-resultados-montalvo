import { Type, Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
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
  @IsOptional() @Matches(/^\+[1-9]\d{7,14}$/) telefono?: string;
  @IsOptional() @IsString() @Length(1, 80) referenciaCrm?: string;
}
export class BuscarPacienteDto {
  @IsOptional() @IsString() @Length(3, 40) ci?: string;
  @IsOptional() @IsString() @Length(2, 40) pac?: string;
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
  @IsBoolean() notificar!: boolean;
  @IsOptional() @IsBoolean() telefonoConfirmado?: boolean;
  @IsOptional() @IsBoolean() consentimientoWhatsApp?: boolean;
  @IsOptional() @IsString() @Length(1, 40) consentimientoVersion?: string;
}
export class RetirarDto extends RevisionDto {
  @IsString() @Length(5, 250) motivo!: string;
}
export class ListarDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite = 25;
  @IsOptional() @IsEnum(EstadoInforme) estado?: EstadoInforme;
  @IsOptional() @IsUUID() pacienteId?: string;
}
export class CodigoDto {
  @IsString() @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.toUpperCase().replace(/[ -]/g, '') : value)
  @Matches(/^[A-Z2-9]{12}$/) codigo!: string;
}
export class EventosDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) despues = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite = 50;
}

export class NotificarDto extends RevisionDto {
  @Equals(true) telefonoConfirmado!: true;
  @Equals(true) consentimientoWhatsApp!: true;
  @IsString() @Length(1, 40) consentimientoVersion!: string;
}

export class PasswordDto {
  @IsString() @Length(1, 128) actual!: string;
  @IsString() @Length(12, 128) nueva!: string;
}
