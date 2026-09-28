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
/**
 * Una sola llamada desde FileMaker: paciente, estudio y PDF juntos.
 *
 * Los campos llegan como texto de un `multipart/form-data`, no como JSON: un
 * JSON no puede llevar el PDF dentro. Las reglas de cada campo son las mismas
 * que las del portal (`PacienteDto`, `CrearInformeDto`) a propósito — una
 * entrada alterna con validación más laxa es una puerta trasera.
 */
export class FileMakerInformeDto {
  /** Médico al que se atribuye el informe: es quien lo verá en su portal. */
  @IsEmail() @MaxLength(254) medico!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(2, 160) nombre!: string;
  @IsOptional() @IsString() @Length(3, 40) @Matches(/^[A-Z0-9 .-]+$/i) ci?: string;
  @IsOptional() @IsString() @Length(2, 40) @Matches(/^[A-Z0-9-]+$/i) pac?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(3, 160) estudio!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaEstudio!: string;
  /**
   * Identificador del registro en FileMaker. Sin él, pulsar el botón dos veces
   * deja dos informes del mismo estudio; con él, la segunda llamada devuelve
   * el primero y no cobra ni duplica nada.
   */
  @IsOptional() @IsString() @Length(1, 80) @Matches(/^[A-Za-z0-9._:-]+$/) referencia?: string;
  /**
   * `true` publica el informe en la misma llamada, sin que nadie lo mire.
   *
   * El paciente queda alcanzable al instante y el aviso entra en la cola del
   * CRM. Publicar no tiene vuelta atrás: corregir obliga a retirar y crear
   * otro. Por omisión queda en borrador.
   *
   * Llega como texto del multipart, no como booleano de JSON.
   */
  @IsOptional() @Transform(({ value }: { value: unknown }) => value === true || value === 'true') @IsBoolean() publicar?: boolean;
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
