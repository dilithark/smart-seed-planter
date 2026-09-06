#include <AccelStepper.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// Initialize the LCD (Address 0x27 is common, or 0x3F; 16 columns, 2 rows)
LiquidCrystal_I2C lcd(0x27, 16, 2);

#define MOTOR_INTERFACE_TYPE 1
#define X_STEP_PIN 14
#define X_DIR_PIN  27
#define Y_STEP_PIN 26
#define Y_DIR_PIN  25
#define X_LIMIT_PIN 12
#define Y_LIMIT_PIN 13

AccelStepper stepperX(MOTOR_INTERFACE_TYPE, X_STEP_PIN, X_DIR_PIN);
AccelStepper stepperY(MOTOR_INTERFACE_TYPE, Y_STEP_PIN, Y_DIR_PIN);

struct Pot {
  int row;
  int col;
  long x;
  long y;
};

Pot hardcodedPotCoordinates[] = {
  {0, 0, 100, 100}, 
  {0, 1, 300, 100}, 
  {0, 2, 500, 100}, 
  {1, 0, 100, 300}, 
  {1, 1, 300, 300}, 
  {1, 2, 500, 300}  
};

void setup() {
  Serial.begin(115200);

  // Initialize LCD screen
  lcd.init();                      
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("System Ready");

  pinMode(X_LIMIT_PIN, INPUT_PULLUP);
  pinMode(Y_LIMIT_PIN, INPUT_PULLUP);

  stepperX.setMaxSpeed(1000.0);
  stepperX.setAcceleration(500.0);
  stepperY.setMaxSpeed(1000.0);
  stepperY.setAcceleration(500.0);

  homeAxes();
  runHardcodedPlanting();
}

void loop() {
  // Main loop remains empty
}

void homeAxes() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Homing Axes...");

  stepperX.setSpeed(-400.0);
  while (digitalRead(X_LIMIT_PIN) == HIGH) { stepperX.runSpeed(); }
  stepperX.stop();
  stepperX.setCurrentPosition(0);

  stepperY.setSpeed(-400.0);
  while (digitalRead(Y_LIMIT_PIN) == HIGH) { stepperY.runSpeed(); }
  stepperY.stop();
  stepperY.setCurrentPosition(0);
}

void runHardcodedPlanting() {
  int totalPots = sizeof(hardcodedPotCoordinates) / sizeof(hardcodedPotCoordinates[0]);

  for (int i = 0; i < totalPots; i++) {
    int currentRow = hardcodedPotCoordinates[i].row;
    int currentCol = hardcodedPotCoordinates[i].col;
    long targetX = hardcodedPotCoordinates[i].x;
    long targetY = hardcodedPotCoordinates[i].y;

    // Update Local LCD Display
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Planting Pot:");
    lcd.setCursor(0, 1);
    lcd.print("Row: ");
    lcd.print(currentRow);
    lcd.print(" Col: ");
    lcd.print(currentCol);

    stepperX.moveTo(targetX);
    stepperY.moveTo(targetY);

    while (stepperX.distanceToGo() != 0 || stepperY.distanceToGo() != 0) {
      stepperX.run();
      stepperY.run();
    }

    delay(1000); // Planting pause
  }

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Sequence Complete");
}