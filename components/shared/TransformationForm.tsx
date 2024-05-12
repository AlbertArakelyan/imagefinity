'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getCldImageUrl } from 'next-cloudinary';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { CustomField } from '@/components/shared/CustomField';
import MediaUploader from '@/components/shared/MediaUploader';
import TransformedImage from '@/components/shared/TransformedImage';
import { InsufficientCreditsModal } from '@/components/shared/InsuficientCreditsModal';

import { updateCredits } from '@/lib/actions/user.actions';
import { addImage, updateImage } from '@/lib/actions/image.actions';

import { AspectRatioKey, debounce, deepMergeObjects } from '@/lib/utils';

import { aspectRatioOptions, creditFee, defaultValues, transformationTypes } from '@/constants';
 
export const formSchema = z.object({
  title: z.string(),
  aspectRatio: z.string().optional(),
  color: z.string().optional(),
  prompt: z.string().optional(),
  publicId: z.string(),
})

const TransformationForm = ({ action, data = null, type, userId, creditBalance, config = null }: TransformationFormProps) => {
  const router = useRouter();

  const [image, setImage] = useState(data);
  const [newTransformation, setNewTransformation] = useState<Transformations | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [transformationConfig, setTransformationConfig] = useState(config);
  const [isPending, startTransition] = useTransition();

  const transformationType = transformationTypes[type];

  const initialValues = data && action === 'Update' ? {
    title: data?.title,
    aspectRatio: data?.aspectRatio,
    color: data?.color,
    prompt: data?.prompt,
    publicId: data?.publicId,
  } : defaultValues;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
  });
  
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);

    if (data || image) {
      const transformationUrl = getCldImageUrl({
        width: image?.width,
        height: image?.height,
        src: image?.publicId,
        ...transformationConfig,
      });

      const imageData = {
        title: values.title,
        publicId: image?.publicId,
        transformationType: type,
        width: image?.width,
        height: image?.height,
        config: transformationConfig,
        secureURL: image?.secureURL,
        transformationURL: transformationUrl,
        aspectRatio: values.aspectRatio,
        prompt: values.prompt,
        color: values.color,
      };

      if (action === 'Add') {
        try {
          const newImage = await addImage({
            image: imageData,
            userId,
            path: '/images',
          });

          if (newImage) {
            form.reset();
            setImage(data);
            router.push(`/transformations/${newImage._id}`)
          }
        } catch(error) {
          console.log(error);
        }
      }

      if (action === 'Update') {
        try {
          const updatedImage = await updateImage({
            image: {
              ...imageData,
              _id: data._id,
            },
            userId,
            path: `/images/${data._id}`,
          });

          if (updatedImage) {
            form.reset();
            setImage(data);
            router.push(`/transformations/${updatedImage._id}`)
          }
        } catch(error) {
          console.log(error);
        }
      }
    }

    setIsSubmitting(false);
  };

  const onSelectFieldHandler = (value: AspectRatioKey, onChangeField: (value: string) => void) => {
    const imageSize = aspectRatioOptions[value];

    setImage((prevState: any) => ({
      ...prevState,
      aspectRatio: imageSize.aspectRatio,
      width: imageSize.width,
      height: imageSize.height,
    }));

    setNewTransformation(transformationType.config);

    return onChangeField(value);
  };

  const onInputChangeHandler = (
    fieldName: string,
    value: string,
    type: TransformationTypeKey,
    onChangeField: (value: string) => void
  ) => {
    debounce(() => {
      setNewTransformation((prevState: any) => ({
        ...prevState,
        [type]: {
          ...prevState?.[type],
          [fieldName === 'prompt' ? 'prompt' : 'to']: value
        }
      }));

      return onChangeField(value);
    }, 1500);
  };

  const onTransformHandler = async () => {
    setIsTransforming(true);
    setTransformationConfig(deepMergeObjects(newTransformation, transformationConfig));
    setNewTransformation(null);

    startTransition(async () => {
      await updateCredits(userId, creditFee);
    });
  };

  useEffect(() => {
    if (image && (type === 'restore' || type === 'removeBackground')) {
      setNewTransformation(transformationType.config);
    }
  }, [image, transformationType.config, type]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {creditBalance < Math.abs(creditFee) && <InsufficientCreditsModal />}
        <CustomField
          control={form.control}
          name="title"
          formLabel="Image Title"
          className="w-full"
          render={({ field }) => <Input className="input-field" {...field} />}
        />
        {type === 'fill' && (
          <CustomField
            control={form.control}
            name="aspectRatio"
            formLabel="Aspect Ratio"
            className="w-full"
            render={({ field }) => (
              <Select
                onValueChange={(value) => onSelectFieldHandler(value as AspectRatioKey, field.onChange)}
              >
                <SelectTrigger className="select-field">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(aspectRatioOptions).map((key) => (
                    <SelectItem className="select-item" key={key} value={key}>
                      {aspectRatioOptions[key as AspectRatioKey].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
        {(type === 'remove' || type === 'recolor') && (
          <div className="prompt-field">
            <CustomField
              control={form.control}
              name="prompt"
              formLabel={type === 'remove' ? 'Object to remove' : 'Object to recolor'}
              className="w-full"
              render={(({ field }) => (
                <Input
                  className="input-field"
                  value={field.value}
                  onChange={(e) => onInputChangeHandler('prompt', e.target.value, type, field.onChange)}
                />
              ))}
            />
          </div>
        )}
        {type === 'recolor' && (
          <CustomField
            control={form.control}
            name="color"
            formLabel="Replacement Color"
            className="w-full"
            render={(({ field }) => (
              <Input 
                className="input-field"
                value={field.value}
                onChange={(e) => onInputChangeHandler('prompt', e.target.value, type, field.onChange)}
              />
            ))}
          />
        )}
        <div className="media-uploader-field">
          <CustomField
            className="flex size-full flex-col"
            control={form.control}
            name="publicId"
            render={(({ field }) => (
              <MediaUploader
                onValueChange={field.onChange}
                setImage={setImage}
                publicId={field.value}
                image={image}
                type={type}
              />
            ))}
          />

          <TransformedImage
            image={image}
            type={type}
            title={form.getValues().title}
            isTransforming={isTransforming}
            setIsTransforming={setIsTransforming}
            transformationConfig={transformationConfig}
          />
        </div>
        <div className="flex flex-col gap-4">
          <Button
            className="submit-button capitalize"
            type="button"
            disabled={isTransforming || newTransformation === null}
            onClick={onTransformHandler}
          >
            {isTransforming ? 'Transforming...' : 'Apply transformation'}
          </Button>
          <Button
            className="submit-button capitalize"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Save image'}
          </Button>
        </div>
        
      </form>
    </Form>
  );
};

export default TransformationForm;
