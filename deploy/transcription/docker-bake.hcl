# Construction de l'image du service de transcription (voir Dockerfile), à
# lancer depuis la racine du dépôt (chemins locaux relatifs au dossier courant) :
#
#   docker buildx bake -f deploy/transcription/docker-bake.hcl cpu --load
#   docker buildx bake -f deploy/transcription/docker-bake.hcl cuda --load
#
# Le runtime NeMo-Speech.cpp est construit depuis son Dockerfile officiel, au
# commit épinglé (un tag peut être déplacé), puis passé à l'image finale comme
# contexte nommé.

variable "NEMO_SPEECH_COMMIT" {
  default = "20999cc921d2b14aa58708f61756a8b2e787ba20" # tag v0.3.0
}

variable "NEMO_SPEECH_VERSION" {
  default = "0.3.0"
}

# Image et tag des images construites (la CI pousse sur GHCR).
variable "IMAGE" {
  default = "syntheo-transcription"
}

variable "TAG_SUFFIX" {
  default = ""
}

# Architectures CUDA : RTX 30xx (86), RTX 40xx (89), RTX 50xx (120a),
# DGX Spark GB10 (121a), plus du PTX 75/80 pour les autres cartes récentes.
# Une seule architecture accélère beaucoup la construction locale, par
# exemple CUDA_ARCH=120a-real pour une RTX 50xx.
variable "CUDA_ARCH" {
  default = "75-virtual;80-virtual;86-real;89-real;120a-real;121a-real"
}

# Tâches de compilation en parallèle (vide : tous les cœurs).
variable "JOBS" {
  default = ""
}

group "default" {
  targets = ["cuda", "cpu"]
}

target "_runtime" {
  context    = "https://github.com/NVIDIA/NeMo-Speech.cpp.git#${NEMO_SPEECH_COMMIT}"
  dockerfile = "docker/Dockerfile"
  target     = "runtime"
}

target "runtime-cuda" {
  inherits = ["_runtime"]
  args = {
    CUDA_ARCH = CUDA_ARCH
    JOBS      = JOBS
  }
}

target "runtime-cpu" {
  inherits = ["_runtime"]
  args = {
    ENABLE_CUDA = "OFF"
    JOBS        = JOBS
  }
}

target "_image" {
  context    = "deploy/transcription"
  dockerfile = "Dockerfile"
  target     = "image"
  args = {
    NEMO_SPEECH_COMMIT  = NEMO_SPEECH_COMMIT
    NEMO_SPEECH_VERSION = NEMO_SPEECH_VERSION
  }
}

target "cuda" {
  inherits = ["_image"]
  contexts = {
    nemo-speech-runtime = "target:runtime-cuda"
  }
  args = {
    VARIANT = "cuda"
  }
  tags = ["${IMAGE}:${NEMO_SPEECH_VERSION}-cuda${TAG_SUFFIX}"]
}

target "cpu" {
  inherits = ["_image"]
  contexts = {
    nemo-speech-runtime = "target:runtime-cpu"
  }
  args = {
    VARIANT = "cpu"
  }
  tags = ["${IMAGE}:${NEMO_SPEECH_VERSION}-cpu${TAG_SUFFIX}"]
}
