-- ============================================================
--  SALUDPLUS — SQL COMPLETO PARA SUPABASE
--  Clínica ficticia · Chiclayo, Perú
--  Pegar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ============================================================
-- 0. EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 1. TABLAS
-- ============================================================

-- ------------------------------------------------------------
-- 1.1  config_clinica
--      Una sola fila. Datos generales de la clínica.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_clinica (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre           text        NOT NULL,
  slogan           text,
  direccion        text        NOT NULL,
  distrito         text        NOT NULL,
  ciudad           text        NOT NULL DEFAULT 'Chiclayo',
  departamento     text        NOT NULL DEFAULT 'Lambayeque',
  telefono_1       text        NOT NULL,
  telefono_2       text,
  whatsapp         text,
  email_contacto   text        NOT NULL,
  email_citas      text,
  lat              numeric(10,7),
  lng              numeric(10,7),
  horario_atencion jsonb,        -- { lun-vie: "08:00-20:00", sab: "09:00-14:00" }
  redes_sociales   jsonb,        -- { facebook, instagram, tiktok }
  seguros_aceptados text[],
  updated_at       timestamptz DEFAULT now()
);

-- Trigger: actualiza updated_at automáticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_config_clinica_updated
  BEFORE UPDATE ON config_clinica
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- 1.2  servicios  (especialidades / áreas médicas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servicios (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        text        NOT NULL,
  slug          text        NOT NULL UNIQUE,
  descripcion   text,
  descripcion_larga text,
  icono         text,         -- nombre de icono (ej: "heart", "brain") o URL SVG
  imagen_url    text,
  color_hex     text,         -- color de acento para la UI, ej: "#0EA5E9"
  orden         smallint    DEFAULT 0,
  activo        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TRIGGER trg_servicios_updated
  BEFORE UPDATE ON servicios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- 1.3  doctores
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctores (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  servicio_id     uuid        REFERENCES servicios(id) ON DELETE SET NULL,
  nombres         text        NOT NULL,
  apellidos       text        NOT NULL,
  slug            text        NOT NULL UNIQUE,
  foto_url        text,
  titulo          text        NOT NULL,   -- "Médico Cirujano", "Cardiólogo", etc.
  cmp             text        UNIQUE,     -- Colegio Médico del Perú
  rne             text,                   -- Registro Nacional de Especialista
  bio             text,
  educacion       jsonb,      -- [{ institucion, grado, anio }]
  especialidades  text[],     -- puede tener sub-especialidades
  idiomas         text[]      DEFAULT ARRAY['Español'],
  atencion_online boolean     NOT NULL DEFAULT false,
  precio_consulta numeric(8,2),
  activo          boolean     NOT NULL DEFAULT true,
  orden           smallint    DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER trg_doctores_updated
  BEFORE UPDATE ON doctores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de búsqueda frecuente
CREATE INDEX IF NOT EXISTS idx_doctores_servicio ON doctores(servicio_id);
CREATE INDEX IF NOT EXISTS idx_doctores_activo   ON doctores(activo);


-- ------------------------------------------------------------
-- 1.4  horarios  (disponibilidad recurrente por doctor)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS horarios (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id       uuid        NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
  dia_semana      smallint    NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  -- 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado, 7=Domingo
  hora_inicio     time        NOT NULL,
  hora_fin        time        NOT NULL,
  duracion_min    smallint    NOT NULL DEFAULT 30 CHECK (duracion_min > 0),
  max_citas       smallint    DEFAULT 1,  -- citas simultáneas por slot
  activo          boolean     NOT NULL DEFAULT true,
  notas           text,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT chk_horario_coherente CHECK (hora_fin > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_horarios_doctor    ON horarios(doctor_id);
CREATE INDEX IF NOT EXISTS idx_horarios_dia       ON horarios(dia_semana);
CREATE INDEX IF NOT EXISTS idx_horarios_activo    ON horarios(activo);


-- ------------------------------------------------------------
-- 1.5  faqs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faqs (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  pregunta    text        NOT NULL,
  respuesta   text        NOT NULL,
  categoria   text,       -- "citas", "seguros", "ubicacion", "general", etc.
  servicio_id uuid        REFERENCES servicios(id) ON DELETE SET NULL,
  orden       smallint    DEFAULT 0,
  activo      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TRIGGER trg_faqs_updated
  BEFORE UPDATE ON faqs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_faqs_categoria ON faqs(categoria);
CREATE INDEX IF NOT EXISTS idx_faqs_activo    ON faqs(activo);


-- ============================================================
-- 2. ROW LEVEL SECURITY
--    Lectura pública en todas las tablas.
--    Escritura solo con service_role (backend / admin).
-- ============================================================

ALTER TABLE config_clinica ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE horarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs            ENABLE ROW LEVEL SECURITY;

-- ---- config_clinica ----------------------------------------
CREATE POLICY "lectura_publica_config"
  ON config_clinica FOR SELECT
  USING (true);

-- ---- servicios ---------------------------------------------
CREATE POLICY "lectura_publica_servicios"
  ON servicios FOR SELECT
  USING (activo = true);

-- ---- doctores ----------------------------------------------
CREATE POLICY "lectura_publica_doctores"
  ON doctores FOR SELECT
  USING (activo = true);

-- ---- horarios ----------------------------------------------
CREATE POLICY "lectura_publica_horarios"
  ON horarios FOR SELECT
  USING (activo = true);

-- ---- faqs --------------------------------------------------
CREATE POLICY "lectura_publica_faqs"
  ON faqs FOR SELECT
  USING (activo = true);

-- NOTA: Las operaciones INSERT / UPDATE / DELETE las ejecuta el
-- backend usando la SERVICE_ROLE key, que bypasea RLS por diseño.
-- No se necesitan políticas de escritura para anon/authenticated.


-- ============================================================
-- 3. DATOS DE PRUEBA
-- ============================================================

-- ------------------------------------------------------------
-- 3.1  config_clinica  (una sola fila)
-- ------------------------------------------------------------
INSERT INTO config_clinica (
  nombre, slogan, direccion, distrito, ciudad, departamento,
  telefono_1, telefono_2, whatsapp,
  email_contacto, email_citas,
  lat, lng,
  horario_atencion,
  redes_sociales,
  seguros_aceptados
) VALUES (
  'SaludPlus',
  'Tu salud, nuestra prioridad',
  'Av. Balta 1042, Of. 301',
  'Cercado',
  'Chiclayo',
  'Lambayeque',
  '+51 74 234567',
  '+51 74 234568',
  '+51 944 123456',
  'contacto@saludplus.pe',
  'citas@saludplus.pe',
  -6.7713800,
  -79.8400600,
  '{
    "lun_vie": "07:30 – 20:00",
    "sabado":  "08:00 – 14:00",
    "domingo": "Cerrado"
  }'::jsonb,
  '{
    "facebook":  "https://facebook.com/saludpluschiclayo",
    "instagram": "https://instagram.com/saludpluschiclayo",
    "tiktok":    "https://tiktok.com/@saludpluschiclayo"
  }'::jsonb,
  ARRAY['Pacífico Seguros', 'Rímac Seguros', 'La Positiva', 'Mapfre', 'EsSalud Complementario', 'SOAT']
);


-- ------------------------------------------------------------
-- 3.2  servicios  (5 especialidades)
-- ------------------------------------------------------------
INSERT INTO servicios (nombre, slug, descripcion, descripcion_larga, icono, color_hex, orden) VALUES

('Cardiología',
 'cardiologia',
 'Diagnóstico y tratamiento de enfermedades del corazón y sistema cardiovascular.',
 'Nuestro servicio de Cardiología ofrece evaluaciones completas del sistema cardiovascular, electrocardiogramas, ecocardiogramas y pruebas de esfuerzo. Contamos con cardiólogos certificados por el Colegio Médico del Perú con experiencia en prevención y manejo de cardiopatías, hipertensión arterial, arritmias e insuficiencia cardíaca.',
 'heart',
 '#EF4444',
 1),

('Neurología',
 'neurologia',
 'Atención especializada del sistema nervioso central y periférico.',
 'El servicio de Neurología de SaludPlus atiende patologías como migraña, epilepsia, enfermedad de Parkinson, esclerosis múltiple, neuropatías periféricas y trastornos del sueño. Realizamos electroencefalogramas (EEG) y trabajamos coordinadamente con neurocirugía cuando se requiere intervención.',
 'brain',
 '#8B5CF6',
 2),

('Pediatría',
 'pediatria',
 'Cuidado integral de la salud del niño y adolescente desde el nacimiento hasta los 17 años.',
 'Nuestra área de Pediatría brinda atención preventiva y curativa a niños desde recién nacidos hasta adolescentes de 17 años. Los controles de crecimiento y desarrollo, el calendario de vacunación, la atención de enfermedades respiratorias, digestivas y dermatológicas son parte de nuestra oferta. Ambiente amigable diseñado para los más pequeños.',
 'baby',
 '#10B981',
 3),

('Traumatología',
 'traumatologia',
 'Tratamiento de lesiones del sistema musculoesquelético: huesos, músculos y articulaciones.',
 'El servicio de Traumatología y Ortopedia atiende fracturas, esguinces, luxaciones, tendinitis, artrosis y patologías de columna. Ofrecemos consulta, infiltraciones, vendajes funcionales y coordinación con fisioterapia para la rehabilitación. También realizamos evaluaciones para certificados médicos laborales y deportivos.',
 'bone',
 '#F59E0B',
 4),

('Ginecología',
 'ginecologia',
 'Salud integral de la mujer en todas las etapas de su vida.',
 'Nuestro servicio de Ginecología y Obstetricia acompaña a la mujer en cada etapa: control prenatal, planificación familiar, detección temprana de cáncer cervicouterino (Papanicolaou y colposcopía), tratamiento de miomas, endometriosis, infecciones de transmisión sexual y menopausia. Contamos con ecógrafo obstétrico de última generación.',
 'female',
 '#EC4899',
 5);


-- ------------------------------------------------------------
-- 3.3  doctores  (5 doctores, uno por servicio)
-- ------------------------------------------------------------
INSERT INTO doctores (
  servicio_id, nombres, apellidos, slug,
  titulo, cmp, rne,
  bio, educacion, especialidades, idiomas,
  atencion_online, precio_consulta, orden
)
SELECT
  s.id,
  d.nombres, d.apellidos, d.slug,
  d.titulo, d.cmp, d.rne,
  d.bio, d.educacion::jsonb, d.especialidades, d.idiomas,
  d.atencion_online, d.precio_consulta, d.orden
FROM servicios s
JOIN (VALUES
  -- Cardiología
  ('cardiologia',
   'Rodrigo Alonso', 'Valdivia Soto', 'rodrigo-valdivia',
   'Médico Cardiólogo', '52341', 'ENE-4821',
   'El Dr. Valdivia cuenta con más de 12 años de experiencia en cardiología intervencionista. Realizó su residencia en el Hospital Nacional Guillermo Almenara de Lima y una fellowship en el Instituto Cardiovascular de Buenos Aires. Especialista en ecocardiografía avanzada y manejo de cardiopatías complejas.',
   '[{"institucion":"Universidad Nacional de Trujillo","grado":"Médico Cirujano","anio":2006},{"institucion":"UNMSM – Hospital G. Almenara","grado":"Especialidad en Cardiología","anio":2012},{"institucion":"Instituto Cardiovascular Buenos Aires","grado":"Fellowship Ecocardiografía","anio":2014}]',
   ARRAY['Ecocardiografía','Holter','Hipertensión arterial','Arritmias'], ARRAY['Español'],
   true, 120.00, 1),

  -- Neurología
  ('neurologia',
   'María Elena', 'Quispe Llontop', 'maria-quispe',
   'Médico Neuróloga', '68904', 'ENE-7203',
   'La Dra. Quispe es especialista en neurología clínica con subespecialidad en cefaleas y trastornos del movimiento. Egresada de la UPCH, desarrolló su residencia en el Hospital Edgardo Rebagliati y publicó investigaciones sobre prevalencia de migraña en la costa norte del Perú. Atiende adultos y adultos mayores.',
   '[{"institucion":"Universidad Peruana Cayetano Heredia","grado":"Médico Cirujano","anio":2009},{"institucion":"Hospital E. Rebagliati – EsSalud","grado":"Especialidad en Neurología","anio":2015}]',
   ARRAY['Migraña','Epilepsia','Parkinson','EEG'], ARRAY['Español','Inglés'],
   false, 130.00, 2),

  -- Pediatría
  ('pediatria',
   'Carlos Enrique', 'Mondragón Pérez', 'carlos-mondragon',
   'Médico Pediatra', '74512', 'ENE-5567',
   'El Dr. Mondragón es pediatra general con formación complementaria en nutrición infantil y desarrollo neurológico. Trabajó 6 años en el Hospital Regional Docente Las Mercedes de Chiclayo antes de integrarse a SaludPlus. Apasionado por la medicina preventiva y la educación a padres.',
   '[{"institucion":"Universidad de San Martín de Porres","grado":"Médico Cirujano","anio":2010},{"institucion":"Hospital Regional Las Mercedes – Chiclayo","grado":"Especialidad en Pediatría","anio":2016}]',
   ARRAY['Neonatología básica','Nutrición infantil','Vacunación','Desarrollo psicomotor'], ARRAY['Español'],
   true, 100.00, 3),

  -- Traumatología
  ('traumatologia',
   'Jimena Paola', 'Saucedo Ramírez', 'jimena-saucedo',
   'Médico Traumatóloga – Ortopedista', '81203', 'ENE-9014',
   'La Dra. Saucedo es traumatóloga ortopedista con especial interés en patología de rodilla y hombro. Realizó un curso avanzado de artroscopía en la Clínica MEDS de Santiago de Chile. Atiende tanto lesiones deportivas como patología degenerativa en adultos mayores.',
   '[{"institucion":"Universidad Nacional Pedro Ruiz Gallo – Lambayeque","grado":"Médico Cirujano","anio":2011},{"institucion":"Hospital Cayetano Heredia – Lima","grado":"Especialidad en Traumatología y Ortopedia","anio":2018},{"institucion":"Clínica MEDS – Chile","grado":"Curso Artroscopía de Rodilla","anio":2020}]',
   ARRAY['Artroscopía','Columna','Fracturas','Medicina deportiva'], ARRAY['Español'],
   false, 110.00, 4),

  -- Ginecología
  ('ginecologia',
   'Sandra Lucía', 'Herrera Távara', 'sandra-herrera',
   'Médico Ginecólogo – Obstetra', '59877', 'ENE-6130',
   'La Dra. Herrera cuenta con 14 años de ejercicio profesional en ginecología y obstetricia. Experta en colposcopía, cirugía laparoscópica ginecológica y manejo de embarazo de alto riesgo. Fue jefa del servicio de Ginecología del Hospital Regional de Lambayeque durante 4 años.',
   '[{"institucion":"Universidad Nacional de Piura","grado":"Médico Cirujano","anio":2005},{"institucion":"Hospital Nacional Arzobispo Loayza – Lima","grado":"Especialidad en Ginecología y Obstetricia","anio":2011},{"institucion":"ISGE – Barcelona","grado":"Diploma Cirugia Laparoscópica","anio":2019}]',
   ARRAY['Colposcopía','Laparoscopía','Control prenatal','Endometriosis'], ARRAY['Español','Inglés'],
   true, 120.00, 5)
) AS d(slug_servicio, nombres, apellidos, slug, titulo, cmp, rne, bio, educacion, especialidades, idiomas, atencion_online, precio_consulta, orden)
ON s.slug = d.slug_servicio;


-- ------------------------------------------------------------
-- 3.4  horarios  (variados por doctor)
-- ------------------------------------------------------------

-- ── Rodrigo Valdivia (Cardiología) ──
-- Lun, Mié, Vie mañana
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 1, '08:00', '13:00', 30, 1 FROM doctores WHERE slug='rodrigo-valdivia';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 3, '08:00', '13:00', 30, 1 FROM doctores WHERE slug='rodrigo-valdivia';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 5, '08:00', '13:00', 30, 1 FROM doctores WHERE slug='rodrigo-valdivia';
-- Mar, Jue tarde
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 2, '15:00', '19:00', 30, 1 FROM doctores WHERE slug='rodrigo-valdivia';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 4, '15:00', '19:00', 30, 1 FROM doctores WHERE slug='rodrigo-valdivia';

-- ── María Elena Quispe (Neurología) ──
-- Lun a Jue tarde (especialista más ocupada)
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 1, '14:00', '19:00', 40, 1 FROM doctores WHERE slug='maria-quispe';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 2, '14:00', '19:00', 40, 1 FROM doctores WHERE slug='maria-quispe';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 3, '14:00', '19:00', 40, 1 FROM doctores WHERE slug='maria-quispe';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 4, '14:00', '19:00', 40, 1 FROM doctores WHERE slug='maria-quispe';
-- Sábado mañana (solo consultas)
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 6, '08:30', '12:30', 40, 1 FROM doctores WHERE slug='maria-quispe';

-- ── Carlos Mondragón (Pediatría) ──
-- Toda la semana laboral, mañana y tarde
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 1, '08:00', '12:00', 20, 1 FROM doctores WHERE slug='carlos-mondragon';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 1, '15:00', '19:00', 20, 1 FROM doctores WHERE slug='carlos-mondragon';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 2, '08:00', '12:00', 20, 1 FROM doctores WHERE slug='carlos-mondragon';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 2, '15:00', '19:00', 20, 1 FROM doctores WHERE slug='carlos-mondragon';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 3, '08:00', '12:00', 20, 1 FROM doctores WHERE slug='carlos-mondragon';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 4, '08:00', '12:00', 20, 1 FROM doctores WHERE slug='carlos-mondragon';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 5, '08:00', '12:00', 20, 1 FROM doctores WHERE slug='carlos-mondragon';
-- Sábado mañana (urgencias pediátricas)
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas, notas)
SELECT id, 6, '09:00', '13:00', 20, 1, 'Incluye urgencias pediátricas' FROM doctores WHERE slug='carlos-mondragon';

-- ── Jimena Saucedo (Traumatología) ──
-- Mar, Jue, Sáb mañana
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 2, '08:00', '13:00', 30, 1 FROM doctores WHERE slug='jimena-saucedo';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 4, '08:00', '13:00', 30, 1 FROM doctores WHERE slug='jimena-saucedo';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 6, '08:00', '12:00', 30, 1 FROM doctores WHERE slug='jimena-saucedo';
-- Lun, Mié tarde
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 1, '16:00', '20:00', 30, 1 FROM doctores WHERE slug='jimena-saucedo';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 3, '16:00', '20:00', 30, 1 FROM doctores WHERE slug='jimena-saucedo';

-- ── Sandra Herrera (Ginecología) ──
-- Lun a Vie (mañana y tarde alternados)
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 1, '08:00', '12:00', 30, 1 FROM doctores WHERE slug='sandra-herrera';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 2, '15:00', '19:00', 30, 1 FROM doctores WHERE slug='sandra-herrera';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 3, '08:00', '12:00', 30, 1 FROM doctores WHERE slug='sandra-herrera';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 4, '15:00', '19:00', 30, 1 FROM doctores WHERE slug='sandra-herrera';
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas)
SELECT id, 5, '08:00', '12:00', 30, 1 FROM doctores WHERE slug='sandra-herrera';
-- Sábado (solo control prenatal)
INSERT INTO horarios (doctor_id, dia_semana, hora_inicio, hora_fin, duracion_min, max_citas, notas)
SELECT id, 6, '08:00', '11:00', 30, 1, 'Solo control prenatal' FROM doctores WHERE slug='sandra-herrera';


-- ------------------------------------------------------------
-- 3.5  faqs  (5 preguntas típicas de una clínica en Chiclayo)
-- ------------------------------------------------------------
INSERT INTO faqs (pregunta, respuesta, categoria, orden) VALUES

('¿Cómo puedo agendar una cita médica?',
 'Puedes agendar tu cita de tres formas: (1) a través de nuestra web en la sección "Agendar Cita", donde eliges especialidad, médico y horario disponible; (2) llamando a nuestros teléfonos +51 74 234567 o +51 74 234568 en horario de atención; o (3) escribiéndonos por WhatsApp al +51 944 123456. Recibirás un correo de confirmación con tu código de cita.',
 'citas',
 1),

('¿Qué seguros médicos aceptan?',
 'Trabajamos con los principales seguros del mercado: Pacífico Seguros, Rímac Seguros, La Positiva, Mapfre y EsSalud Complementario. También cubrimos atenciones por SOAT en caso de accidentes de tránsito. Te recomendamos llamarnos antes de tu cita para verificar la cobertura específica de tu póliza, ya que los beneficios varían según el plan contratado.',
 'seguros',
 2),

('¿Dónde están ubicados y cómo llego?',
 'Nos encontramos en Av. Balta 1042, Oficina 301, en el centro de Chiclayo, a media cuadra del Parque Principal. Puedes llegar en cualquier micro que pase por la Av. Balta o tomar un taxi/mototaxi indicando "Av. Balta con Colón". Contamos con estacionamiento en la misma cuadra. Nuestro horario de atención es de lunes a viernes de 7:30 a 20:00 horas, y sábados de 8:00 a 14:00 horas.',
 'ubicacion',
 3),

('¿Puedo cancelar o reprogramar mi cita?',
 'Sí. Puedes cancelar o reprogramar tu cita hasta con 2 horas de anticipación sin ningún costo. Solo necesitas tu código de cita (formato SP-XXXX), que recibiste en el correo de confirmación. Puedes hacerlo llamando al +51 74 234567, por WhatsApp al +51 944 123456 o directamente desde el enlace que te enviamos en el correo. Cancelaciones con menos de 2 horas de anticipación quedan registradas en tu historial.',
 'citas',
 4),

('¿Cuánto cuesta una consulta médica?',
 'El costo de consulta varía según la especialidad: Medicina General desde S/ 60, Pediatría desde S/ 100, Traumatología desde S/ 110, Cardiología y Ginecología desde S/ 120, y Neurología desde S/ 130. Estos precios corresponden a consulta particular. Si cuentas con seguro médico, el costo dependerá de tu cobertura. Aceptamos pago en efectivo, tarjetas de crédito/débito Visa y Mastercard, y transferencias bancarias (BCP y Interbank).',
 'general',
 5);


-- ============================================================
-- 4. VERIFICACIÓN RÁPIDA
--    Ejecutar tras la carga para confirmar que todo quedó bien.
-- ============================================================

-- SELECT 'config_clinica' AS tabla, count(*) FROM config_clinica
-- UNION ALL
-- SELECT 'servicios',   count(*) FROM servicios
-- UNION ALL
-- SELECT 'doctores',    count(*) FROM doctores
-- UNION ALL
-- SELECT 'horarios',    count(*) FROM horarios
-- UNION ALL
-- SELECT 'faqs',        count(*) FROM faqs;

-- Resultado esperado:
--  config_clinica  |  1
--  servicios       |  5
--  doctores        |  5
--  horarios        | 26
--  faqs            |  5
