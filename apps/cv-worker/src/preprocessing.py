import cv2
def convert_to_hsv(frame):
    hsv_frame = cv2.cvtColor(frame,cv2.COLOR_BGR2HSV)    
    return hsv_frame

def preprocess(frame):
    #receive frame BGR from Open Cv

    #Converts BGR -> HSV
    frame_hsv = convert_to_hsv(frame)
    #H → Hue        → which color
    #S → Saturation → color intensity
    #V → Value      → luminosity


    return frame_hsv