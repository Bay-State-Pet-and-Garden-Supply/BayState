#!/usr/bin/env python3
import os

content = """name: Scraper CD

on:
  workflow_dispatch:
    inputs:
      force_build:
        description: 'Force build even without scraper changes'
        required: false
        default: false
        type: boolean
  push:
    branches: [main, master, develop, dev]
    tags: ["v*"]
    paths:
      - 'apps/scraper/**'
      - '.github/workflows/scraper-cd.yml'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/scraper

jobs:
  changes:
    name: Detect scraper changes
    runs-on: ubuntu-latest
    outputs:
      scraper: ${{ steps.filter.outputs.scraper }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check changed paths
        id: filter
        uses: dorny/paths-filter@v3
        with:
          filters: |
            scraper:
              - 'apps/scraper/**'
              - '.github/workflows/scraper-cd.yml'

  build-amd64:
    name: Build & Push AMD64 Image
    runs-on: ubuntu-latest
    needs: changes
    if: needs.changes.outputs.scraper == 'true' || (github.event_name == 'workflow_dispatch' && inputs.force_build)
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to the Container registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags, labels) for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=tag
            type=sha,format=short
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master' || github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/dev' }}
            type=raw,value=latest-amd64,enable=${{ github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master' || github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/dev' }}
            type=raw,value=develop,enable=${{ github.ref == 'refs/heads/develop' }}
            type=raw,value=develop-amd64,enable=${{ github.ref == 'refs/heads/develop' }}
            type=raw,value=dev,enable=${{ github.ref == 'refs/heads/dev' }}
            type=raw,value=dev-amd64,enable=${{ github.ref == 'refs/heads/dev' }}

      - name: Build and push AMD64 image
        id: build_image
        uses: docker/build-push-action@v6
        with:
          context: ./apps/scraper
          file: ./apps/scraper/Dockerfile
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            RUNNER_BUILD_ID=${{ github.run_id }}-${{ github.run_attempt }}
            RUNNER_BUILD_SHA=${{ github.sha }}

      - name: Publish latest runner release metadata
        if: contains(steps.meta.outputs.tags, ':latest-amd64')
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          RUNNER_RELEASE_CHANNEL: latest
          RUNNER_BUILD_ID: ${{ github.run_id }}-${{ github.run_attempt }}
          RUNNER_BUILD_SHA: ${{ github.sha }}
          RUNNER_IMAGE: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          RUNNER_IMAGE_DIGEST: ${{ steps.build_image.outputs.digest }}
        run: node scripts/publish-scraper-runner-release.mjs

      - name: Publish develop runner release metadata
        if: contains(steps.meta.outputs.tags, ':develop-amd64')
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          RUNNER_RELEASE_CHANNEL: develop
          RUNNER_BUILD_ID: ${{ github.run_id }}-${{ github.run_attempt }}
          RUNNER_BUILD_SHA: ${{ github.sha }}
          RUNNER_IMAGE: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          RUNNER_IMAGE_DIGEST: ${{ steps.build_image.outputs.digest }}
        run: node scripts/publish-scraper-runner-release.mjs

      - name: Publish dev runner release metadata
        if: contains(steps.meta.outputs.tags, ':dev-amd64')
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          RUNNER_RELEASE_CHANNEL: dev
          RUNNER_BUILD_ID: ${{ github.run_id }}-${{ github.run_attempt }}
          RUNNER_BUILD_SHA: ${{ github.sha }}
          RUNNER_IMAGE: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          RUNNER_IMAGE_DIGEST: ${{ steps.build_image.outputs.digest }}
        run: node scripts/publish-scraper-runner-release.mjs

      - name: Upload AMD64 digest
        uses: actions/upload-artifact@v4
        with:
          name: amd64-digest
          path: ${{ steps.build_image.outputs.digest }}
          retention-days: 1

  build-arm64:
    name: Build & Push ARM64 Image
    runs-on: ubuntu-latest
    needs: changes
    if: |
      (needs.changes.outputs.scraper == 'true' || (github.event_name == 'workflow_dispatch' && inputs.force_build))
      && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master' || github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/dev')
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to the Container registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags, labels) for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=tag
            type=sha,format=short
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master' || github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/dev' }}
            type=raw,value=latest-arm64,enable=${{ github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master' || github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/dev' }}
            type=raw,value=develop,enable=${{ github.ref == 'refs/heads/develop' }}
            type=raw,value=develop-arm64,enable=${{ github.ref == 'refs/heads/develop' }}
            type=raw,value=dev,enable=${{ github.ref == 'refs/heads/dev' }}
            type=raw,value=dev-arm64,enable=${{ github.ref == 'refs/heads/dev' }}

      - name: Build and push ARM64 image
        id: build_image
        uses: docker/build-push-action@v6
        with:
          context: ./apps/scraper
          file: ./apps/scraper/Dockerfile
          platforms: linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            RUNNER_BUILD_ID=${{ github.run_id }}-${{ github.run_attempt }}
            RUNNER_BUILD_SHA=${{ github.sha }}

      - name: Upload ARM64 digest
        uses: actions/upload-artifact@v4
        with:
          name: arm64-digest
          path: ${{ steps.build_image.outputs.digest }}
          retention-days: 1

  manifest:
    name: Create and Push Manifest
    runs-on: ubuntu-latest
    needs: [build-amd64, build-arm64]
    if: |
      needs.build-arm64.outputs && 
      (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master' || github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/dev')
    permissions:
      contents: read
      packages: write

    steps:
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Download AMD64 digest
        uses: actions/download-artifact@v4
        with:
          name: amd64-digest

      - name: Download ARM64 digest
        uses: actions/download-artifact@v4
        with:
          name: arm64-digest

      - name: Log in to the Container registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags, labels) for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=tag
            type=sha,format=short
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master' || github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/dev' }}
            type=raw,value=develop,enable=${{ github.ref == 'refs/heads/develop' }}
            type=raw,value=dev,enable=${{ github.ref == 'refs/heads/dev' }}

      - name: Create and push manifest
        run: |
          AMD64_DIGEST=$(cat amd64-digest)
          ARM64_DIGEST=$(cat arm64-digest)
          
          echo "Creating manifest for AMD64: $AMD64_DIGEST"
          echo "Creating manifest for ARM64: $ARM64_DIGEST"
          
          IMAGE="${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}"
          
          for TAG in $(echo "${{ steps.meta.outputs.tags }}" | tr ',' '\n'); do
            TAG=$(echo "$TAG" | xargs)
            if [ -n "$TAG" ]; then
              echo "Creating manifest for tag: $TAG"
              
              docker manifest create "${IMAGE}:${TAG#*:}" \
                --amend "${IMAGE}@${AMD64_DIGEST}" \
                --amend "${IMAGE}@${ARM64_DIGEST}"
              
              docker manifest annotate "${IMAGE}:${TAG#*:}" "${IMAGE}@${AMD64_DIGEST}" --os linux --arch amd64
              docker manifest annotate "${IMAGE}:${TAG#*:}" "${IMAGE}@${ARM64_DIGEST}" --os linux --arch arm64
              
              docker manifest push "${IMAGE}:${TAG#*:}"
              echo "Pushed manifest: ${IMAGE}:${TAG#*:}"
            fi
          done
"""

with open(".github/workflows/scraper-cd.yml", "w") as f:
    f.write(content)
print("File written successfully")
