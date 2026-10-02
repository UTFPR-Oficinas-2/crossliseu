

VIDEO_PATH = "batalha.exemplo.mp4"

ROBOT_COLORS = {
    "robo_azul": [
        ((100, 120, 50), (130, 255, 255)),
    ],
    "robo_vermelho": [
        ((0, 120, 70), (10, 255, 255)),
        ((170, 120, 70), (179, 255, 255)),
    ],
}

# Pre-processamento: tamanho do kernel do desfoque
BLUR_KERNEL = 5

# Segmentacao: tamanho do kernel da limpeza morfologica (0 desliga)
MORPH_KERNEL = 5
