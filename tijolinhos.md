@@ -1,3 +1,77 @@
# Game

Fonte: https://github.com/phaserjs/template-parcel-ts

## Integração com a Feira de Jogos

A Feira de Jogos usa OAuth 2.0 do Google para autenticação dos usuários. É usada a biblioteca fornecida pelo provedor de identidade no arquivo `index.html`:

```html
<script src="https://accounts.google.com/gsi/client" async></script>
```

Como é uma biblioteca a parte do jogo, pode-se definir os tipos `google.accounts` com a dependência de desenvolvedor `@types/google.accounts` e aplicar no arquivo `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["google.accounts"]
  }
}
```

Assim, é possível definir a cena final, de _game over_, para autenticar o usuário e adicionar crédito na sua conta da feira. Exemplo:

```js
import { Scene } from "phaser";
import axios from "axios";

export class GameOver extends Scene {
  constructor() {
    super("GameOver");
  }

  create() {
    google.accounts.id.initialize({
      client_id:
        "331191695151-ku8mdhd76pc2k36itas8lm722krn0u64.apps.googleusercontent.com",
      callback: (res: any) => {
        if (res.error) {
          console.error(res.error);
        } else {
          axios
            .post(
              "https://feira-de-jogos.dev.br/api/v2/credit",
              {
                product: 1, // id do jogo cadastrado no banco de dados da Feira de Jogos
                value: 100, // crédito em tijolinhos
              },
              {
                headers: {
                  Authorization: `Bearer ${res.credential}`,
                },
              },
            )
            .then(function (response: any) {
              console.log(response);
              alert("Crédito adicionado!");
            })
            .catch(function (error: any) {
              console.error(error);
              alert("Erro ao adicionar crédito :(");
            });
        }
      },
    });

    google.accounts.id.prompt();
  }
}
```

Para facilitar, foi usado `axios` para processar as respostas da requisição `POST` de crédito.

Detalhe para dois parâmetros que devem ser personalizados jogo a jogo:

1. `product`: identificação do produto na feira;
1. `value`: quantidade de crédito.






‎index.html‎
+1Lines changed: 1 addition & 0 deletions
Original file line number	Diff line number	Diff line change
@@ -12,6 +12,7 @@
    <div id="app">
      <div id="game-container"></div>
    </div>
    <script src="https://accounts.google.com/gsi/client"></script>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>





src/game/scenes/Game.ts‎
+3-1Lines changed: 3 additions & 1 deletion
Original file line number	Diff line number	Diff line change
@@ -275,13 +275,15 @@ export class Game extends Scene {
    });

    this.physics.add.overlap(this.player, this.laser, () => {
      if (this.gameOver) return;
      this.gameOver = true;
      this.music.stop();

      this.player.setVelocity(0, 0);
      this.player.anims.play("player-dying", true);
      this.player.once("animationcomplete", () => {
        this.scene.pause();
        this.scene.stop("Game");
        this.scene.start("GameOver");
      });
    });





src/game/scenes/GameOver.ts‎
+32-21Lines changed: 32 additions & 21 deletions
Original file line number	Diff line number	Diff line change
@@ -1,33 +1,44 @@
import { Scene } from "phaser";
import axios from "axios";

export class GameOver extends Scene {
  camera: Phaser.Cameras.Scene2D.Camera;
  background: Phaser.GameObjects.Image;
  gameover_text: Phaser.GameObjects.Text;
  constructor() {
    super("GameOver");
  }

  create() {
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(0xff0000);
    this.background = this.add.image(512, 384, "background");
    this.background.setAlpha(0.5);
    this.gameover_text = this.add.text(512, 384, "Game Over", {
      fontFamily: "Arial Black",
      fontSize: 64,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 8,
      align: "center",
    google.accounts.id.initialize({
      client_id:
        "331191695151-ku8mdhd76pc2k36itas8lm722krn0u64.apps.googleusercontent.com",
      callback: (res: any) => {
        if (res.error) {
          console.error(res.error);
        } else {
          axios
            .post(
              "https://feira-de-jogos.dev.br/api/v2/credit",
              {
                product: 1, // id do jogo cadastrado no banco de dados da Feira de Jogos
                value: 100, // crédito em tijolinhos
              },
              {
                headers: {
                  Authorization: `Bearer ${res.credential}`,
                },
              },
            )
            .then(function (response: any) {
              console.log(response);
              alert("Crédito adicionado!");
            })
            .catch(function (error: any) {
              console.error(error);
              alert("Erro ao adicionar crédito :(");
            });
        }
      },
    });
    this.gameover_text.setOrigin(0.5);

    this.input.once("pointerdown", () => {
      this.scene.start("MainMenu");
    });
    google.accounts.id.prompt();
  }
}




‎tsconfig.json‎
+5-1Lines changed: 5 additions & 1 deletion
Original file line number	Diff line number	Diff line change
@@ -1 +1,5 @@
{}
{
  "compilerOptions": {
    "types": ["google.accounts"]
  }
}