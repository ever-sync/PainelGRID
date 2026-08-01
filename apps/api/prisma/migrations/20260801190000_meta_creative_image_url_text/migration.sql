-- URL assinada da Meta passa de 500 caracteres com facilidade e derrubava o
-- sync inteiro em `metaCreative.create` ("value too long for type"), antes de
-- chegar na etapa de insights -- por isso as metricas ficavam zeradas.
ALTER TABLE "meta_creatives" ALTER COLUMN "image_url" TYPE TEXT;
