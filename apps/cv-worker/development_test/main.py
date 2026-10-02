import cv2

from config import VIDEO_PATH, ROBOT_COLORS, BLUR_KERNEL, MORPH_KERNEL
from preprocessing import preprocess
from segmentation import segment_all


def main():
    # CAPTURA 
    cap = cv2.VideoCapture(VIDEO_PATH)
    if not cap.isOpened():
        print(f"N consegui abrir o video: {VIDEO_PATH}")
        return

    paused = False
    frame = None

    while True:
        if not paused or frame is None:
            ret, frame = cap.read()
            if not ret:
                print("Fim do video.")
                break

        # PRE-PROCESSAMENTO 
        hsv = preprocess(frame, BLUR_KERNEL)

        # SEGMENTCAO
        masks = segment_all(hsv, ROBOT_COLORS, MORPH_KERNEL)

        # EXIBICAO (para teste)
        cv2.imshow("Original (BGR)", frame)
        # O HSV aparece com cores estranhas: o imshow le os canais como BGR.
        cv2.imshow("HSV (so para conferir)", hsv)

        for name, mask in masks.items():
            cv2.imshow(f"Mascara - {name}", mask)
            # Aplica a mascara no frame original: mostra so os pixels
            # que a mascara considerou como robo. Ajuda a verificar o resultado.
            only_robot = cv2.bitwise_and(frame, frame, mask=mask)
            cv2.imshow(f"Resultado - {name}", only_robot)

        key = cv2.waitKey(30) & 0xFF
        if key == ord("q"):
            break
        if key == ord(" "):
            paused = not paused

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
