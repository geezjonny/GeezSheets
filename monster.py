import pygame
import json
import random

pygame.init()

# ----------------------------------
# Window
# ----------------------------------

WIDTH, HEIGHT = 900, 700

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Random Encounter Generator")

clock = pygame.time.Clock()

font = pygame.font.SysFont(None, 28)
title = pygame.font.SysFont(None, 42)

WHITE = (240,240,240)
GRAY = (180,180,180)
BLACK = (25,25,30)

# ----------------------------------
# Load monsters
# ----------------------------------

with open("data/monsters.json", encoding="utf8") as f:
    monsters = json.load(f)

# ----------------------------------
# CR values available
# ----------------------------------

CR_VALUES = [
    0,
    0.125,
    0.25,
    0.5,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30
]

cr_index = 8      # Starts at CR 5

# ----------------------------------
# Weighted Encounter Generator
# ----------------------------------

def generate_encounter(target):

    encounter = []
    remaining = target

    while remaining >= 0.125:

        choices = [
            m for m in monsters
            if m["challenge_rating"] <= remaining
        ]

        if not choices:
            break

        # Weight monsters closer to the remaining CR
        weights = []

        for monster in choices:

            diff = remaining - monster["challenge_rating"]

            # closer CR gets larger weight
            weight = 1 / (diff + 0.2)

            weights.append(weight)

        chosen = random.choices(choices, weights=weights, k=1)[0]

        encounter.append(chosen)

        remaining -= chosen["challenge_rating"]
        remaining = round(remaining, 3)

    return encounter


encounter = generate_encounter(CR_VALUES[cr_index])

# ----------------------------------
# Draw
# ----------------------------------

def draw():

    screen.fill(BLACK)

    y = 20

    img = title.render("Random Encounter", True, WHITE)
    screen.blit(img, (20, y))

    y += 55

    cr = CR_VALUES[cr_index]

    img = font.render(f"Target CR: {cr}", True, WHITE)
    screen.blit(img, (20, y))

    y += 40

    total = sum(m["challenge_rating"] for m in encounter)

    img = font.render(f"Generated CR: {total}", True, GRAY)
    screen.blit(img, (20, y))

    y += 50

    for monster in encounter:

        line = f"{monster['name']}   (CR {monster['challenge_rating']})"

        img = font.render(line, True, WHITE)
        screen.blit(img, (40, y))

        y += 32

    y = HEIGHT - 90

    screen.blit(font.render("SPACE = New Encounter", True, GRAY), (20, y))
    y += 30
    screen.blit(font.render("UP / DOWN = Change Target CR", True, GRAY), (20, y))

    pygame.display.flip()

# ----------------------------------
# Main Loop
# ----------------------------------

running = True

while running:

    for event in pygame.event.get():

        if event.type == pygame.QUIT:
            running = False

        if event.type == pygame.KEYDOWN:

            if event.key == pygame.K_SPACE:
                encounter = generate_encounter(CR_VALUES[cr_index])

            elif event.key == pygame.K_UP:
                if cr_index < len(CR_VALUES)-1:
                    cr_index += 1
                    encounter = generate_encounter(CR_VALUES[cr_index])

            elif event.key == pygame.K_DOWN:
                if cr_index > 0:
                    cr_index -= 1
                    encounter = generate_encounter(CR_VALUES[cr_index])

    draw()

    clock.tick(60)

pygame.quit()