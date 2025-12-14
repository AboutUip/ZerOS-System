/**
 * Copyright 2022 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/** Options to configure MediaPipe model loading and processing. */
declare interface BaseOptions_2 {
    /**
     * The model path to the model asset file. Only one of `modelAssetPath` or
     * `modelAssetBuffer` can be set.
     */
    modelAssetPath?: string | undefined;
    /**
     * A buffer or stream reader containing the model asset. Only one of
     * `modelAssetPath` or `modelAssetBuffer` can be set.
     */
    modelAssetBuffer?: Uint8Array | ReadableStreamDefaultReader | undefined;
    /** Overrides the default backend to use for the provided model. */
    delegate?: "CPU" | "GPU" | undefined;
}

/**
 * Copyright 2023 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/** An integer bounding box, axis aligned. */
export declare interface BoundingBox {
    /** The X coordinate of the top-left corner, in pixels. */
    originX: number;
    /** The Y coordinate of the top-left corner, in pixels. */
    originY: number;
    /** The width of the bounding box, in pixels. */
    width: number;
    /** The height of the bounding box, in pixels. */
    height: number;
    /**
     * Angle of rotation of the original non-rotated box around the top left
     * corner of the original non-rotated box, in clockwise degrees from the
     * horizontal.
     */
    angle: number;
}

/**
 * A user-defined callback to take input data and map it to a custom output
 * value.
 */
export declare type Callback<I, O> = (input: I) => O;

/**
 * Copyright 2022 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/** A classification category. */
export declare interface Category {
    /** The probability score of this label category. */
    score: number;
    /** The index of the category in the corresponding label file. */
    index: number;
    /**
     * The label of this category object. Defaults to an empty string if there is
     * no category.
     */
    categoryName: string;
    /**
     * The display name of the label, which may be translated for different
     * locales. For example, a label, "apple", may be translated into Spanish for
     * display purpose, so that the `display_name` is "manzana". Defaults to an
     * empty string if there is no display name.
     */
    displayName: string;
}

/**
 * A category to color mapping that uses either a map or an array to assign
 * category indexes to RGBA colors.
 */
export declare type CategoryToColorMap = Map<number, RGBAColor> | RGBAColor[];

/** Classification results for a given classifier head. */
export declare interface Classifications {
    /**
     * The array of predicted categories, usually sorted by descending scores,
     * e.g., from high to low probability.
     */
    categories: Category[];
    /**
     * The index of the classifier head these categories refer to. This is
     * useful for multi-head models.
     */
    headIndex: number;
    /**
     * The name of the classifier head, which is the corresponding tensor
     * metadata name. Defaults to an empty string if there is no such metadata.
     */
    headName: string;
}

/**
 * Copyright 2022 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/** Options to configure a MediaPipe Classifier Task. */
declare interface ClassifierOptions {
    /**
     * The locale to use for display names specified through the TFLite Model
     * Metadata, if any. Defaults to English.
     */
    displayNamesLocale?: string | undefined;
    /** The maximum number of top-scored detection results to return. */
    maxResults?: number | undefined;
    /**
     * Overrides the value provided in the model metadata. Results below this
     * value are rejected.
     */
    scoreThreshold?: number | undefined;
    /**
     * Allowlist of category names. If non-empty, detection results whose category
     * name is not in this set will be filtered out. Duplicate or unknown category
     * names are ignored. Mutually exclusive with `categoryDenylist`.
     */
    categoryAllowlist?: string[] | undefined;
    /**
     * Denylist of category names. If non-empty, detection results whose category
     * name is in this set will be filtered out. Duplicate or unknown category
     * names are ignored. Mutually exclusive with `categoryAllowlist`.
     */
    categoryDenylist?: string[] | undefined;
}

/** A connection between two landmarks. */
declare interface Connection {
    start: number;
    end: number;
}

/** A color map with 22 classes. Used in our demos. */
export declare const DEFAULT_CATEGORY_TO_COLOR_MAP: number[][];

/** Represents one detection by a detection task. */
export declare interface Detection {
    /** A list of `Category` objects. */
    categories: Category[];
    /** The bounding box of the detected objects. */
    boundingBox?: BoundingBox;
    /**
     * List of keypoints associated with the detection. Keypoints represent
     * interesting points related to the detection. For example, the keypoints
     * represent the eye, ear and mouth from face detection model. Or in the
     * template matching detection, e.g. KNIFT, they can represent the feature
     * points for template matching. Contains an empty list if no keypoints are
     * detected.
     */
    keypoints: NormalizedKeypoint[];
}

/** Detection results of a model. */
declare interface DetectionResult {
    /** A list of Detections. */
    detections: Detection[];
}
export { DetectionResult as FaceDetectorResult }
export { DetectionResult as ObjectDetectorResult }

/**
 * Options for customizing the drawing routines
 */
export declare interface DrawingOptions {
    /** The color that is used to draw the shape. Defaults to white. */
    color?: string | CanvasGradient | CanvasPattern | Callback<LandmarkData, string | CanvasGradient | CanvasPattern>;
    /**
     * The color that is used to fill the shape. Defaults to `.color` (or black
     * if color is not set).
     */
    fillColor?: string | CanvasGradient | CanvasPattern | Callback<LandmarkData, string | CanvasGradient | CanvasPattern>;
    /** The width of the line boundary of the shape. Defaults to 4. */
    lineWidth?: number | Callback<LandmarkData, number>;
    /** The radius of location marker. Defaults to 6. */
    radius?: number | Callback<LandmarkData, number>;
}

/** Helper class to visualize the result of a MediaPipe Vision task. */
export declare class DrawingUtils {
    /**
     * Creates a new DrawingUtils class.
     *
     * @param gpuContext The WebGL canvas rendering context to render into. If
     *     your Task is using a GPU delegate, the context must be obtained from
     * its canvas (provided via `setOptions({ canvas: .. })`).
     */
    constructor(gpuContext: WebGL2RenderingContext);
    /**
     * Creates a new DrawingUtils class.
     *
     * @param cpuContext The 2D canvas rendering context to render into. If
     *     you are rendering GPU data you must also provide `gpuContext` to allow
     *     for data conversion.
     * @param gpuContext A WebGL canvas that is used for GPU rendering and for
     *     converting GPU to CPU data. If your Task is using a GPU delegate, the
     *     context must be obtained from  its canvas (provided via
     *     `setOptions({ canvas: .. })`).
     */
    constructor(cpuContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, gpuContext?: WebGL2RenderingContext);
    /**
     * Restricts a number between two endpoints (order doesn't matter).
     *
     * @export
     * @param x The number to clamp.
     * @param x0 The first boundary.
     * @param x1 The second boundary.
     * @return The clamped value.
     */
    static clamp(x: number, x0: number, x1: number): number;
    /**
     * Linearly interpolates a value between two points, clamping that value to
     * the endpoints.
     *
     * @export
     * @param x The number to interpolate.
     * @param x0 The x coordinate of the start value.
     * @param x1 The x coordinate of the end value.
     * @param y0 The y coordinate of the start value.
     * @param y1 The y coordinate of the end value.
     * @return The interpolated value.
     */
    static lerp(x: number, x0: number, x1: number, y0: number, y1: number): number;
    /**
     * Draws circles onto the provided landmarks.
     *
     * This method can only be used when `DrawingUtils` is initialized with a
     * `CanvasRenderingContext2D`.
     *
     * @export
     * @param landmarks The landmarks to draw.
     * @param style The style to visualize the landmarks.
     */
    drawLandmarks(landmarks?: NormalizedLandmark[], style?: DrawingOptions): void;
    /**
     * Draws lines between landmarks (given a connection graph).
     *
     * This method can only be used when `DrawingUtils` is initialized with a
     * `CanvasRenderingContext2D`.
     *
     * @export
     * @param landmarks The landmarks to draw.
     * @param connections The connections array that contains the start and the
     *     end indices for the connections to draw.
     * @param style The style to visualize the landmarks.
     */
    drawConnectors(landmarks?: NormalizedLandmark[], connections?: Connection[], style?: DrawingOptions): void;
    /**
     * Draws a bounding box.
     *
     * This method can only be used when `DrawingUtils` is initialized with a
     * `CanvasRenderingContext2D`.
     *
     * @export
     * @param boundingBox The bounding box to draw.
     * @param style The style to visualize the bounding box.
     */
    drawBoundingBox(boundingBox: BoundingBox, style?: DrawingOptions): void;
    /**
     * Draws a category mask using the provided category-to-color mapping.
     *
     * @export
     * @param mask A category mask that was returned from a segmentation task.
     * @param categoryToColorMap A map that maps category indices to RGBA
     *     values. You must specify a map entry for each category.
     * @param background A color or image to use as the background. Defaults to
     *     black.
     */
    drawCategoryMask(mask: MPMask, categoryToColorMap: Map<number, RGBAColor>, background?: RGBAColor | ImageSource): void;
    /**
     * Draws a category mask using the provided color array.
     *
     * @export
     * @param mask A category mask that was returned from a segmentation task.
     * @param categoryToColorMap An array that maps indices to RGBA values. The
     *     array's indices must correspond to the category indices of the model
     *     and an entry must be provided for each category.
     * @param background A color or image to use as the background. Defaults to
     *     black.
     */
    drawCategoryMask(mask: MPMask, categoryToColorMap: RGBAColor[], background?: RGBAColor | ImageSource): void;
    /**
     * Blends two images using the provided confidence mask.
     *
     * If you are using an `ImageData` or `HTMLImageElement` as your data source
     * and drawing the result onto a `WebGL2RenderingContext`, this method uploads
     * the image data to the GPU. For still image input that gets re-used every
     * frame, you can reduce the cost of re-uploading these images by passing a
     * `HTMLCanvasElement` instead.
     *
     * @export
     * @param mask A confidence mask that was returned from a segmentation task.
     * @param defaultTexture An image or a four-channel color that will be used
     *     when confidence values are low.
     * @param overlayTexture An image or four-channel color that will be used when
     *     confidence values are high.
     */
    drawConfidenceMask(mask: MPMask, defaultTexture: RGBAColor | ImageSource, overlayTexture: RGBAColor | ImageSource): void;
    /**
     * Frees all WebGL resources held by this class.
     * @export
     */
    close(): void;
}

/**
 * Copyright 2022 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/** Options to configure a MediaPipe Embedder Task */
declare interface EmbedderOptions {
    /**
     * Whether to normalize the returned feature vector with L2 norm. Use this
     * option only if the model does not already contain a native L2_NORMALIZATION
     * TF Lite Op. In most cases, this is already the case and L2 norm is thus
     * achieved through TF Lite inference.
     */
    l2Normalize?: boolean | undefined;
    /**
     * Whether the returned embedding should be quantized to bytes via scalar
     * quantization. Embeddings are implicitly assumed to be unit-norm and
     * therefore any dimension is guaranteed to have a value in [-1.0, 1.0]. Use
     * the l2_normalize option if this is not the case.
     */
    quantize?: boolean | undefined;
}

/**
 * Copyright 2022 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */