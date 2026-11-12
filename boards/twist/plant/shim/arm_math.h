/* SPDX-License-Identifier: LGPL-2.1 */
/** Host-only CMSIS-DSP stand-in for native control C-Blocks. */
#pragma once
#include <math.h>
#include <stdint.h>
typedef float float32_t;
typedef double float64_t;
typedef int32_t q31_t;
#ifndef PI
#define PI 3.14159265358979f
#endif
static inline float32_t arm_sin_f32(float32_t x) { return sinf(x); }
static inline float32_t arm_cos_f32(float32_t x) { return cosf(x); }
typedef struct { uint16_t numTaps; float32_t *pState; const float32_t *pCoeffs; } arm_fir_instance_f32;
static inline void arm_fir_init_f32(arm_fir_instance_f32 *s, uint16_t num_taps,
    const float32_t *coefficients, float32_t *state, uint32_t block_size)
{ s->numTaps = num_taps; s->pCoeffs = coefficients; s->pState = state; (void)block_size; }
static inline void arm_fir_f32(const arm_fir_instance_f32 *s, const float32_t *source,
    float32_t *destination, uint32_t block_size)
{ (void)s; (void)source; (void)destination; (void)block_size; }
