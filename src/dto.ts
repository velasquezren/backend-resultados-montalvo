import { Type, Transform } from 'class-transformer';
import { ArrayMaxSize, Equals, IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
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
  /**
   * Médico al que se atribuye el informe: es quien lo verá en su portal.
   *
   * Opcional solo si el servidor define `FILEMAKER_MEDICO_POR_DEFECTO`. Con el
   * valor por defecto TODOS los informes de FileMaker caen en una sola cuenta:
   * los demás médicos no los ven y la auditoría dice siempre el mismo nombre.
   */
  @IsOptional() @IsEmail() @MaxLength(254) medico?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(2, 160) nombre!: string;
  @IsOptional() @IsString() @Length(3, 40) @Matches(/^[A-Z0-9 .-]+$/i) ci?: string;
  @IsOptional() @IsString() @Length(2, 40) @Matches(/^[A-Z0-9-]+$/i) pac?: string;
  /** Sin él se usa «Ecografía»: `Informe.tipo` ya nace como ECOGRAFIA. */
  @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(3, 160) estudio?: string;
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
/** Un booleano que llega por query string: solo `true`/`false` literales. */
const booleanoDeQuery = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Filtros de la cola del CRM. Todos se resuelven AQUÍ, donde se corta la
 * página: si el CRM filtrara una página que ya cortó el portal, una pestaña
 * mostraría 3 de 25 y diría «no hay más» cuando las hay en la siguiente.
 */
export class InformesCrmDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite = 50;
  /** Un solo informe: el CRM revalida contra el portal justo antes de enviar. */
  @IsOptional() @IsUUID() informeId?: string;
  /** Nombre, PAC o CI del paciente. */
  @IsOptional() @Transform(recortar) @IsString() @Length(2, 80) buscar?: string;
  /** `true`: la paciente ya lo abrió. `false`: todavía no. */
  @IsOptional() @Transform(booleanoDeQuery) @IsBoolean() abierto?: boolean;
  /** `true`: el enlace sirve hoy. `false`: venció o se revocó. */
  @IsOptional() @Transform(booleanoDeQuery) @IsBoolean() vigente?: boolean;
  /**
   * Varios informes por id, en el orden que se pidan: la página de una pestaña
   * que decide el CRM (qué está avisado solo lo sabe él). `a,b,c` en la query.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true })
  ids?: string[];
}

/** El panorama de la cola: la búsqueda solo marca qué ids coinciden. */
export class PanoramaCrmDto {
  @IsOptional() @Transform(recortar) @IsString() @Length(2, 80) buscar?: string;
}
export class PasswordDto {
  @IsString() @Length(1, 128) actual!: string;
  @IsString() @Length(12, 128) nueva!: string;
}
