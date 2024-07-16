import express, { Application, Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";

interface User {
  id: number;
  name: string;
  socketId?: string;
  tasks: Task[];
}

interface Task {
  from: string;
  task: string;
  status: "pending" | "accepted" | "rejected" | "notified";
}

class App {
  private users: User[] = [
    { id: 1, name: "rodrigo", tasks: [] },
    { id: 2, name: "joao", tasks: [] },
    { id: 3, name: "pedro", tasks: [] },
  ];
  private app: Application;
  private http: http.Server;
  private io: Server;

  constructor() {
    this.app = express();
    this.http = http.createServer(this.app);
    this.io = new Server(this.http);
    this.listenSocket();
    this.setupRoutes();
  }

  listenServer() {
    this.http.listen(3000, () => console.log("server is running"));
  }

  listenSocket() {
    this.io.on("connection", (socket: Socket) => {
      socket.on("login", (userName) => {
        const user = this.users.find((user) => user.name === userName);
        if (user) {
          user.socketId = socket.id;
          socket.emit("loginSuccess", user);
          console.log(`${userName} logged in with socket id ${socket.id}`);

          // Enviar tarefas pendentes
          if (user.tasks.length > 0) {
            user.tasks.forEach((task) => {
              socket.emit("taskNotification", task);
            });
          }
        } else {
          socket.emit("loginError", "User not found");
        }
      });

      socket.on("message", (data) => {
        const { msg, toUserName } = data;
        const toUser = this.users.find((user) => user.name === toUserName);
        if (toUser && toUser.socketId) {
          this.io.to(toUser.socketId).emit("message", {
            from: socket.id,
            msg,
          });
        } else {
          socket.emit("messageError", "Recipient not found or not connected");
        }
      });

      socket.on("taskRequest", (data) => {
        const { task, toUserName } = data;
        const toUser = this.users.find((user) => user.name === toUserName);
        const fromUser = this.users.find((user) => user.socketId === socket.id);
        if (toUser) {
          const newTask: Task = {
            from: fromUser?.name || "Unknown",
            task,
            status: "pending",
          };
          toUser.tasks.push(newTask);
          if (toUser.socketId) {
            this.io.to(toUser.socketId).emit("taskNotification", newTask);
          }
        } else {
          socket.emit("taskError", "Recipient not found");
        }
      });

      socket.on("taskResponse", (data) => {
        const { task, status } = data;
        const user = this.users.find((user) => user.socketId === socket.id);
        if (user) {
          const taskIndex = user.tasks.findIndex(
            (t) => t.task === task && t.status === "pending"
          );
          if (taskIndex >= 0) {
            user.tasks[taskIndex].status = status;
            const fromUser = this.users.find(
              (u) => u.name === user.tasks[taskIndex].from
            );
            if (fromUser && fromUser.socketId) {
              this.io
                .to(fromUser.socketId)
                .emit("taskResponse", { task, status, from: user.name });
            } else {
              // Notificação offline
              if (fromUser) {
                fromUser.tasks.push({
                  from: user.name,
                  task: `Tarefa ${task} foi ${status} por ${user.name}`,
                  status: "notified",
                });
              }
            }
          }
        }
      });
    });
  }

  setupRoutes() {
    this.app.get("/", (req: Request, res: Response) => {
      res.sendFile(__dirname + "/index.html");
    });
  }
}

const app = new App();
app.listenServer();
