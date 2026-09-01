/**
 * Typed supertest request helpers.
 * Reduces boilerplate in integration tests.
 */
import request from "supertest";
import type { Express } from "express";

export function getRequest(app: Express, path: string) {
  return request(app).get(path);
}

export function postRequest(app: Express, path: string, body: unknown) {
  return request(app).post(path).send(body as object).set("Content-Type", "application/json");
}

export function patchRequest(app: Express, path: string, body: unknown) {
  return request(app).patch(path).send(body as object).set("Content-Type", "application/json");
}

export function deleteRequest(app: Express, path: string) {
  return request(app).delete(path);
}
